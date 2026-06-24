import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto, UpdateAppointmentDto, CancelAppointmentDto, UploadUrlRequestDto, ConfirmUploadDto } from './dto/appointment.dto';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { ContentModerationService } from '../ai/guards/content-moderation.service';
import { SmsService } from '../notifications/sms.service';

@Injectable()
export class AppointmentService {
  private bucket: any;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private moderation: ContentModerationService,
    private smsService: SmsService,
    @Inject('FIREBASE_ADMIN') private firebaseAdmin: any,
  ) {
    const bucketName = this.configService.get<string>('FIREBASE_STORAGE_BUCKET');
    if (bucketName && this.firebaseAdmin) {
      this.bucket = getStorage(this.firebaseAdmin).bucket(bucketName);
    }
  }

  async getAppointments(tenantId: string, page = 1, pageSize = 20) {
    const safePage = Number.isFinite(page) ? Math.max(1, Number(page)) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Number(pageSize))) : 20;
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { source: { not: 'crm' } },
          { contentItems: { some: { deletedAt: null } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
      include: {
        client: { select: { firstName: true, lastName: true } },
        imageAssets: {
          where: { deletedAt: null },
          select: { id: true, rawUrl: true, isBeforePhoto: true, isAfterPhoto: true },
        },
        _count: { select: { contentItems: { where: { deletedAt: null } } } },
      },
    });

    // Resolve consent status via appointment.consentRecordId (direct FK),
    // falling back to the client's current consent record if no direct link exists.
    const consentIds = rows.map((r) => r.consentRecordId).filter(Boolean) as string[];
    const clientIds = rows.map((r) => r.clientId).filter(Boolean) as string[];

    const [linkedConsents, currentConsents] = await Promise.all([
      consentIds.length > 0
        ? this.prisma.consentRecord.findMany({
            where: { id: { in: consentIds }, tenantId },
            select: { id: true, status: true },
          })
        : Promise.resolve([]),
      clientIds.length > 0
        ? this.prisma.consentRecord.findMany({
            where: { clientId: { in: clientIds }, tenantId, isCurrent: true },
            select: { clientId: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const linkedMap = new Map(linkedConsents.map((c) => [c.id, c.status]));
    const clientMap = new Map(currentConsents.map((c) => [c.clientId, c.status]));

    return rows.map((a) => ({
      ...a,
      clientName: a.client ? `${a.client.firstName} ${a.client.lastName}` : 'Client',
      consentStatus: (
        a.consentRecordId
          ? (linkedMap.get(a.consentRecordId) ?? clientMap.get(a.clientId))
          : clientMap.get(a.clientId)
      ) ?? 'not_requested',
      beforePhotoUrl: a.imageAssets.find((i) => i.isBeforePhoto)?.rawUrl ?? null,
      afterPhotoUrl: a.imageAssets.find((i) => i.isAfterPhoto)?.rawUrl ?? null,
      contentCount: (a as any)._count?.contentItems ?? 0,
    }));
  }

  async getAppointment(tenantId: string, id: string) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        imageAssets: {
          where: { deletedAt: null },
          select: { rawUrl: true, isBeforePhoto: true, isAfterPhoto: true },
        },
      },
    });
    if (!apt || apt.tenantId !== tenantId || apt.deletedAt) throw new NotFoundException('Appointment not found');

    // Resolve consent via direct consentRecordId link, or fall back to client's current record
    const consentRecord = apt.consentRecordId
      ? await this.prisma.consentRecord.findUnique({
          where: { id: apt.consentRecordId },
          select: {
            status: true,
            allowShowFace: true,
            allowUseName: true,
            allowTagSocial: true,
            allowPlatformPromotion: true,
            allowInternalUse: true,
            allowMarketingContent: true,
          },
        })
      : await this.prisma.consentRecord.findFirst({
          where: { clientId: apt.clientId, tenantId, isCurrent: true },
          select: {
            status: true,
            allowShowFace: true,
            allowUseName: true,
            allowTagSocial: true,
            allowPlatformPromotion: true,
            allowInternalUse: true,
            allowMarketingContent: true,
          },
        });

    return {
      ...apt,
      clientId: apt.client?.id ?? null,
      clientName: apt.client ? `${apt.client.firstName} ${apt.client.lastName}` : 'Client',
      consentRecord,
      consentStatus: consentRecord?.status ?? 'not_requested',
      beforePhotoUrl: apt.imageAssets?.find((i) => i.isBeforePhoto)?.rawUrl ?? null,
      afterPhotoUrl: apt.imageAssets?.find((i) => i.isAfterPhoto)?.rawUrl ?? null,
    };
  }

  async createAppointment(tenantId: string, dto: CreateAppointmentDto) {
    return this.prisma.appointment.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        consentRecordId: dto.consentRecordId,
        serviceCategory: dto.serviceCategory as any,
        serviceName: dto.serviceName,
        serviceDescription: dto.serviceDescription,
        appointmentDate: new Date(dto.appointmentDate),
        appointmentTime: dto.appointmentTime ? new Date(`1970-01-01T${dto.appointmentTime}Z`) : null,
        durationMinutes: dto.durationMinutes,
        notes: dto.notes,
      }
    });
  }

  async updateAppointment(tenantId: string, id: string, dto: UpdateAppointmentDto) {
    await this.getAppointment(tenantId, id);
    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...dto,
        serviceCategory: dto.serviceCategory as any,
        appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : undefined,
      }
    });
  }

  async deleteAppointment(tenantId: string, id: string) {
    await this.getAppointment(tenantId, id);
    return this.prisma.appointment.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async cancelAppointment(tenantId: string, id: string, dto: CancelAppointmentDto) {
    await this.getAppointment(tenantId, id);
    
    return this.prisma.appointment.update({
      where: { id },
      data: {
        isCancelled: true,
        cancellationReason: dto.cancellationReason,
      }
    });
  }

  async getImages(tenantId: string, id: string) {
    await this.getAppointment(tenantId, id);
    return this.prisma.imageAsset.findMany({
      where: { appointmentId: id, tenantId, deletedAt: null }
    });
  }

  async generateUploadUrl(tenantId: string, appointmentId: string, dto: UploadUrlRequestDto) {
    await this.getAppointment(tenantId, appointmentId);

    const photoType = dto.isBeforePhoto ? 'before' : 'after';
    const path = `tenants/${tenantId}/appointments/${appointmentId}/${photoType}/${uuidv4()}-${dto.filename}`;
    const file = this.bucket.file(path);

    // Generate signed URL for resumable upload (POST/PUT)
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: dto.contentType,
    });

    return {
      uploadUrl,
      storagePath: path,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  async confirmUpload(tenantId: string, appointmentId: string, dto: ConfirmUploadDto, isBeforePhoto: boolean) {
    await this.getAppointment(tenantId, appointmentId);
    const expectedPrefix = `tenants/${tenantId}/appointments/${appointmentId}/`;
    if (!dto.storagePath.startsWith(expectedPrefix)) {
      throw new BadRequestException('Invalid storage path for appointment');
    }

    const file = this.bucket.file(dto.storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new BadRequestException('Uploaded file could not be verified');
    }

    const [metadata] = await file.getMetadata();

    const existing = await this.prisma.imageAsset.findFirst({
      where: { s3ObjectHash: dto.fileHash, deletedAt: null } // Legacy column name; stores file hash
    });
    if (existing) {
      throw new BadRequestException('Image already exists (duplicate hash)');
    }

    // Build Firebase Storage public download URL (rules allow read: true for tenant paths)
    const bucketName = this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || '';
    const rawUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dto.storagePath)}?alt=media`;

    // Content safety moderation — reject and delete from Firebase if unsafe
    const modResult = await this.moderation.moderateImage(rawUrl);
    if (!modResult.safe) {
      await file.delete().catch(() => {});
      this.moderation.assertImageSafe(modResult);
    }

    const asset = await this.prisma.imageAsset.create({
      data: {
        tenantId,
        appointmentId,
        rawUrl,
        s3Key: dto.storagePath,
        s3Bucket: this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || '',
        s3ObjectHash: dto.fileHash,
        fileSizeBytes: Number(metadata.size || dto.fileSizeBytes || 0),
        isBeforePhoto,
        isAfterPhoto: !isBeforePhoto,
        uploadValidated: true,
      }
    });

    return {
      imageId: asset.id,
      rawUrl,
    };
  }

  async uploadImageDirect(tenantId: string, appointmentId: string, file: Express.Multer.File, isBeforePhoto: boolean) {
    await this.getAppointment(tenantId, appointmentId);
    if (!this.bucket) throw new BadRequestException('Firebase Storage is not configured');

    const photoType = isBeforePhoto ? 'before' : 'after';
    const path = `tenants/${tenantId}/appointments/${appointmentId}/${photoType}/${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const fileRef = this.bucket.file(path);
    await fileRef.save(file.buffer, {
      metadata: { contentType: file.mimetype },
    });
    await fileRef.makePublic();

    const bucketName = this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || '';
    const rawUrl = `https://storage.googleapis.com/${bucketName}/${path}`;

    // Content safety moderation — reject and delete from Firebase if unsafe
    const modResult = await this.moderation.moderateImage(rawUrl);
    if (!modResult.safe) {
      await fileRef.delete().catch(() => {});
      this.moderation.assertImageSafe(modResult);
    }

    const asset = await this.prisma.imageAsset.create({
      data: {
        tenantId,
        appointmentId,
        rawUrl,
        s3Key: path,
        s3Bucket: bucketName,
        s3ObjectHash: `direct-${Date.now()}`,
        fileSizeBytes: file.size,
        isBeforePhoto,
        isAfterPhoto: !isBeforePhoto,
        uploadValidated: true,
      },
    });

    return { imageId: asset.id, rawUrl };
  }

  async deleteImage(tenantId: string, appointmentId: string, imageId: string) {
    const image = await this.prisma.imageAsset.findUnique({ where: { id: imageId } });
    if (!image || image.tenantId !== tenantId || image.appointmentId !== appointmentId) {
      throw new NotFoundException('Image not found');
    }

    return this.prisma.imageAsset.update({
      where: { id: imageId },
      data: { deletedAt: new Date() }
    });
  }

  async getContent(tenantId: string, appointmentId: string) {
    await this.getAppointment(tenantId, appointmentId);
    return this.prisma.contentItem.findMany({
      where: { appointmentId, tenantId, deletedAt: null }
    });
  }

  async sendConsentReminder(tenantId: string, appointmentId: string): Promise<{ sent: boolean; reason: string }> {
    const apt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
        consentRecord: { select: { status: true } },
      },
    });

    if (!apt || apt.tenantId !== tenantId) throw new NotFoundException('Appointment not found');

    // Resolve consent status: direct link → client's current record
    let consentStatus: string | null = apt.consentRecord?.status ?? null;
    if (!consentStatus && apt.clientId) {
      const current = await this.prisma.consentRecord.findFirst({
        where: { clientId: apt.clientId, tenantId, isCurrent: true },
        select: { status: true },
      });
      consentStatus = current?.status ?? null;
    }

    if (consentStatus === 'granted') {
      throw new BadRequestException('Consent already granted — no reminder needed.');
    }
    if (consentStatus === 'declined') {
      throw new BadRequestException('Client has declined consent — cannot send reminder.');
    }

    const phone = apt.client?.phone;
    if (!phone) {
      return { sent: false, reason: 'Client has no phone number on file.' };
    }

    const clientName  = apt.client ? `${apt.client.firstName}` : 'your client';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const consentLink = `${frontendUrl}/consent/${apt.id}`;

    const message =
      `Hi ${clientName}! Your beauty technician is waiting on your content consent ` +
      `before sharing your transformation photos. It only takes a moment — ` +
      `please review and confirm here: ${consentLink}`;

    await this.smsService.sendSms(phone, message);

    return { sent: true, reason: `SMS sent to ${phone}` };
  }
}
