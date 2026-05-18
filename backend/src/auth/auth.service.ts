import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class AuthService {
  private readonly saltRounds = 12;
  private readonly refreshTokenPepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshTokenPepper = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(`${token}:${this.refreshTokenPepper}`).digest('hex');
  }

  async register(registerDto: RegisterDto) {
    const { email, password, businessName, timezone } = registerDto;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new HttpException('Email is already registered', HttpStatus.CONFLICT);
    }

    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'technician',
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          userId: user.id,
          businessName,
          timezone,
          subscriptionTier: 'free',
        },
      });

      return { userId: user.id, tenantId: tenant.id };
    });
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ 
      where: { email: loginDto.email },
      include: { tenant: true }
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is locked due to too many failed attempts. Try again later.');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const updateData: any = { failedLoginAttempts: newAttempts };

      if (newAttempts >= 10) {
        // Lock for 30 minutes
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + 30);
        updateData.lockedUntil = lockUntil;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return this.generateTokens(user.id, user.role, user.tenant?.id, ipAddress, userAgent);
  }

  async refreshTokens(oldRefreshToken: string, ipAddress?: string, userAgent?: string) {
    const oldTokenHash = this.hashRefreshToken(oldRefreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: oldTokenHash },
      include: { user: { include: { tenant: true } } }
    });

    if (!storedToken) {
      await this.prisma.refreshToken.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected. Please log in again.');
    }

    if (storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(storedToken.userId, storedToken.user.role, storedToken.user.tenant?.id, ipAddress, userAgent);
  }

  async logout(refreshToken: string) {
    if (refreshToken) {
      const tokenHash = this.hashRefreshToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            businessName: user.tenant.businessName,
            hasGrowthStudioAccess: user.tenant.hasGrowthStudioAccess,
            subscriptionTier: user.tenant.subscriptionTier,
            status: user.tenant.status,
          }
        : null,
    };
  }

  private async generateTokens(userId: string, role: string, tenantId?: string, ipAddress?: string, userAgent?: string) {
    const payload = { sub: userId, role, tenantId };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshTokenValue = uuidv4();
    const refreshTokenHash = this.hashRefreshToken(refreshTokenValue);
    const refreshExpires = new Date();
    refreshExpires.setDate(refreshExpires.getDate() + 30); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpires,
        ipAddress,
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }
}
