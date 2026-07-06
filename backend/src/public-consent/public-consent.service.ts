import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';

@Injectable()
export class PublicConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  private generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  private maskPhone(phone: string): string {
    const clean = phone.replace(/\s/g, '');
    if (clean.length <= 4) return '****';
    return clean.slice(0, 3) + ' **** ' + clean.slice(-3);
  }

  private async validateToken(token: string) {
    const record = await this.prisma.consentRecord.findUnique({
      where: { consentToken: token },
      include: {
        appointment: { select: { id: true, serviceName: true, appointmentDate: true } },
        client: { select: { firstName: true, lastName: true, phone: true } },
        tenant: { select: { businessName: true, displayName: true } },
      },
    });

    if (!record) throw new NotFoundException('Consent link not found or invalid.');
    if (record.consentTokenUsedAt) throw new BadRequestException('This consent link has already been used.');
    if (record.consentTokenExpiresAt && record.consentTokenExpiresAt < new Date()) {
      throw new BadRequestException('This consent link has expired. Please ask your technician to send a new one.');
    }

    return record;
  }

  async getConsentByToken(token: string) {
    const record = await this.validateToken(token);

    // If OTP already verified in this session, return consent data directly
    if (record.consentOtpVerifiedAt) {
      return this.buildConsentData(record);
    }

    const phone = record.client?.phone;
    if (!phone) {
      throw new BadRequestException('No phone number on file for this client. Please contact your technician.');
    }

    // Rate-limit: don't re-send if an OTP was sent less than 60 seconds ago
    // (OTP expires in 10 min; if >9 min remain, it was sent <60s ago)
    const now = new Date();
    const otpRecentlySent =
      record.consentOtpExpiresAt &&
      record.consentOtpExpiresAt.getTime() - now.getTime() > 9 * 60 * 1000;

    if (!otpRecentlySent) {
      const otp = this.generateOtp();
      await this.prisma.consentRecord.update({
        where: { id: record.id },
        data: {
          consentOtp: this.hashOtp(otp),
          consentOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          consentOtpVerifiedAt: null,
        },
      });
      await this.sms.sendSms(
        phone,
        `Your Elle.Be.O verification code is ${otp}. It expires in 10 minutes. Do not share this code.`,
      );
    }

    return {
      step: 'otp_required' as const,
      maskedPhone: this.maskPhone(phone),
    };
  }

  async verifyOtp(token: string, otp: string) {
    const record = await this.validateToken(token);

    if (!record.consentOtp || !record.consentOtpExpiresAt) {
      throw new BadRequestException('No verification code was requested. Please go back and try again.');
    }
    if (record.consentOtpExpiresAt < new Date()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }
    if (record.consentOtp !== this.hashOtp(otp.trim())) {
      throw new BadRequestException('Incorrect verification code. Please try again.');
    }

    await this.prisma.consentRecord.update({
      where: { id: record.id },
      data: { consentOtpVerifiedAt: new Date() },
    });

    return this.buildConsentData(record);
  }

  async grantConsentByToken(
    token: string,
    permissions: {
      allowShowFace: boolean;
      allowUseName: boolean;
      allowTagSocial: boolean;
      allowPlatformPromotion: boolean;
      allowInternalUse: boolean;
      allowMarketingContent: boolean;
    },
    ip: string,
    device: string,
  ) {
    const record = await this.validateToken(token);

    if (!record.consentOtpVerifiedAt) {
      throw new BadRequestException('Phone verification required before submitting consent.');
    }

    await this.prisma.consentRecord.update({
      where: { id: record.id },
      data: {
        status: 'granted',
        allowShowFace: permissions.allowShowFace,
        allowUseName: permissions.allowUseName,
        allowTagSocial: permissions.allowTagSocial,
        allowPlatformPromotion: permissions.allowPlatformPromotion,
        allowInternalUse: permissions.allowInternalUse,
        allowMarketingContent: permissions.allowMarketingContent,
        consentMethod: 'sms_link',
        grantedAt: new Date(),
        consentTokenUsedAt: new Date(),
        consentGrantedIp: ip,
        consentGrantedDevice: device,
      },
    });

    return { success: true };
  }

  async declineByToken(token: string) {
    const record = await this.validateToken(token);

    if (!record.consentOtpVerifiedAt) {
      throw new BadRequestException('Phone verification required before declining consent.');
    }

    await this.prisma.consentRecord.update({
      where: { id: record.id },
      data: {
        status: 'declined',
        consentTokenUsedAt: new Date(),
      },
    });

    return { success: true };
  }

  private buildConsentData(record: Awaited<ReturnType<typeof this.validateToken>>) {
    const techName = record.tenant.displayName || record.tenant.businessName;
    return {
      clientFirstName: record.client.firstName,
      technicianName: techName,
      service: record.appointment?.serviceName ?? null,
      appointmentDate: record.appointment?.appointmentDate ?? null,
      currentPermissions: {
        allowShowFace: record.allowShowFace,
        allowUseName: record.allowUseName,
        allowTagSocial: record.allowTagSocial,
        allowPlatformPromotion: record.allowPlatformPromotion,
        allowInternalUse: record.allowInternalUse,
        allowMarketingContent: record.allowMarketingContent,
      },
    };
  }
}
