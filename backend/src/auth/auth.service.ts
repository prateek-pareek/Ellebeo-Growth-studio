import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly saltRounds = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: oldRefreshToken },
      include: { user: { include: { tenant: true } } }
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
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
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: refreshToken },
        data: { revokedAt: new Date() },
      });
    }
  }

  private async generateTokens(userId: string, role: string, tenantId?: string, ipAddress?: string, userAgent?: string) {
    const payload = { sub: userId, role, tenantId };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refreshTokenValue = uuidv4();
    const refreshExpires = new Date();
    refreshExpires.setDate(refreshExpires.getDate() + 30); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenValue,
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
