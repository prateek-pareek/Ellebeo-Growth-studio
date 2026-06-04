import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { firebaseAuth, firebaseStorage } from '../config/firebase.client';

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

  async firebaseLogin(firebaseIdToken: string, ipAddress?: string, userAgent?: string) {
    if (!firebaseAuth) throw new UnauthorizedException('Firebase auth not configured');

    let decoded: Awaited<ReturnType<typeof firebaseAuth.verifyIdToken>>;
    try {
      decoded = await firebaseAuth.verifyIdToken(firebaseIdToken);
    } catch (err: any) {
      throw new UnauthorizedException(`Invalid Google token: ${err.message}`);
    }

    const email = decoded.email;
    if (!email) throw new UnauthorizedException('Google account has no email address');

    let user = await this.prisma.user.findUnique({ where: { email }, include: { tenant: true } });

    if (!user) {
      const randomHash = await bcrypt.hash(uuidv4(), this.saltRounds);
      const displayName = (decoded.name as string | undefined) || email.split('@')[0];

      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { email, passwordHash: randomHash, role: 'technician', emailVerified: true },
        });
        await tx.tenant.create({
          data: {
            userId: newUser.id,
            businessName: displayName,
            timezone: 'UTC',
            subscriptionTier: 'free',
            hasGrowthStudioAccess: true,
          },
        });
        return tx.user.findUnique({ where: { id: newUser.id }, include: { tenant: true } });
      });
    }

    if (!user) throw new UnauthorizedException('Failed to resolve user account');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });

    return this.generateTokens(user.id, user.role, user.tenant?.id, ipAddress, userAgent);
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
          hasGrowthStudioAccess: true,
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

    const tenantId = user.tenant?.id;

    // Compute real stats from DB
    const [brandDna, photoCount, appointmentCount, contentCount] = await Promise.all([
      tenantId
        ? this.prisma.brandDNA.findUnique({
            where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
            include: { pillars: true },
          })
        : null,
      tenantId
        ? this.prisma.imageAsset.count({ where: { tenantId, deletedAt: null } })
        : 0,
      tenantId
        ? this.prisma.appointment.count({ where: { tenantId, deletedAt: null } })
        : 0,
      tenantId
        ? this.prisma.contentItem.count({ where: { tenantId, deletedAt: null } })
        : 0,
    ]);

    // Count distinct services from appointments
    const serviceRows = tenantId
      ? await this.prisma.appointment.findMany({
          where: { tenantId, deletedAt: null, serviceName: { not: undefined } },
          select: { serviceName: true },
          distinct: ['serviceName'],
        })
      : [];
    const servicesListed = serviceRows.length;

    // Profile completion (0–100)
    let completion = 0;
    if (brandDna) completion += 30;
    if (brandDna?.primaryTone) completion += 10;
    if (brandDna?.primaryBrandColor) completion += 10;
    if ((brandDna?.pillars?.length ?? 0) > 0) completion += 10;
    if (appointmentCount > 0) completion += 15;
    if (photoCount > 0) completion += 15;
    if (contentCount > 0) completion += 10;

    // Bio strength
    let bioStrength = 'Weak';
    if (brandDna) {
      const fields = [brandDna.primaryTone, brandDna.oneLiner, brandDna.uniqueSellingProposition, brandDna.primaryPersona].filter(Boolean).length;
      if (fields >= 4) bioStrength = 'Strong';
      else if (fields >= 2) bioStrength = 'Good';
      else bioStrength = 'Fair';
    }

    // Fetch appointments without photos and unapproved content
    const [appointmentsWithoutPhotos, draftContent, scheduledContent] = await Promise.all([
      tenantId
        ? this.prisma.appointment.count({
            where: { tenantId, deletedAt: null, imageAssets: { none: { deletedAt: null } } },
          })
        : 0,
      tenantId
        ? this.prisma.contentItem.count({ where: { tenantId, deletedAt: null, status: 'draft' } })
        : 0,
      tenantId
        ? this.prisma.contentItem.count({ where: { tenantId, deletedAt: null, status: 'scheduled' } })
        : 0,
    ]);

    // Dynamic suggestions — always show actionable items
    const suggestions: Array<{ label: string; impact: string; link: string }> = [];

    // Brand DNA gaps
    if (!brandDna) {
      suggestions.push({ label: 'Set up your Brand DNA to power AI-generated content', impact: 'High', link: '/brand/onboarding' });
    } else {
      if (!brandDna.primaryBrandColor) suggestions.push({ label: 'Add brand colours to your Brand DNA', impact: 'High', link: '/brand/onboarding' });
      if ((brandDna.pillars?.length ?? 0) < 3) suggestions.push({ label: 'Define at least 3 content pillars in Brand DNA', impact: 'High', link: '/brand/onboarding' });
      if (!brandDna.uniqueSellingProposition) suggestions.push({ label: 'Describe your signature service in Brand DNA', impact: 'Medium', link: '/brand/onboarding' });
      if (bioStrength !== 'Strong') suggestions.push({ label: "Complete your brand voice — add tone words and do/don't rules", impact: 'Medium', link: '/brand/onboarding' });
    }

    // Photo gaps
    if (appointmentCount === 0) {
      suggestions.push({ label: 'Add your first appointment to start generating content', impact: 'High', link: '/appointments' });
    } else if (appointmentsWithoutPhotos > 0) {
      suggestions.push({ label: `Add before/after photos to ${appointmentsWithoutPhotos} appointment${appointmentsWithoutPhotos > 1 ? 's' : ''} without photos`, impact: 'High', link: '/appointments' });
    }
    if (photoCount < 5 && photoCount > 0) {
      suggestions.push({ label: `Upload ${5 - photoCount} more photos — aim for at least 5 across your appointments`, impact: 'Medium', link: '/appointments' });
    }

    // Content gaps
    if (contentCount === 0 && appointmentCount > 0) {
      suggestions.push({ label: 'Generate your first post from an existing appointment', impact: 'High', link: '/generate' });
    }
    if (draftContent > 0) {
      suggestions.push({ label: `Review and approve ${draftContent} draft${draftContent > 1 ? 's' : ''} waiting in your content library`, impact: 'Medium', link: '/content' });
    }
    if (scheduledContent === 0 && contentCount > 0) {
      suggestions.push({ label: 'Schedule at least one approved post to your social account', impact: 'Low', link: '/content' });
    }

    // City: prefer Brand DNA location, fall back to tenant timezone
    const city = brandDna?.locationCity || user.tenant?.timezone || 'Unknown';

    // Display name: businessName (no firstName/lastName in User model)
    const displayName = user.tenant?.businessName || 'Technician';
    const handle = `@${displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName,
      handle,
      city,
      avatarUrl: user.tenant?.avatarUrl ?? null,
      profileCompletion: completion,
      servicesCount: servicesListed,
      servicesRecommended: 8,
      photosCount: photoCount,
      photosRecommended: 18,
      bioStrength,
      suggestions,
      // CRM-sourced stats (not available in Growth Studio DB — shown as 0)
      averageRating: 0,
      reviewsCount: 0,
      responseTimeHours: 0,
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

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!firebaseStorage) throw new HttpException('Storage not configured', HttpStatus.SERVICE_UNAVAILABLE);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { tenant: true } });
    if (!user?.tenant) throw new UnauthorizedException('Tenant not found');

    const bucket = firebaseStorage.bucket();
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filePath = `avatars/${user.tenant.id}/avatar_${Date.now()}.${ext}`;
    const fileRef = bucket.file(filePath);
    await fileRef.save(file.buffer, { contentType: file.mimetype, public: true });
    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    await this.prisma.tenant.update({ where: { id: user.tenant.id }, data: { avatarUrl: url } });
    return { url };
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
