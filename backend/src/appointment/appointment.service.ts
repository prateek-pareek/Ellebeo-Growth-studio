import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto, UpdateAppointmentDto, CancelAppointmentDto, UploadUrlRequestDto, ConfirmUploadDto } from './dto/appointment.dto';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppointmentService {
  private bucket: any;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @Inject('FIREBASE_ADMIN') private firebaseAdmin: any,
  ) {
    const bucketName = this.configService.get<string>('FIREBASE_STORAGE_BUCKET');
    if (bucketName) {
      this.bucket = this.firebaseAdmin.storage().bucket(bucketName);
    } else {
      console.warn('FIREBASE_STORAGE_BUCKET not configured. Upload features will be disabled.');
    }
  }

  async getAppointments(tenantId: string, page = 1, pageSize = 20) {
    const safePage = Number.isFinite(page) ? Math.max(1, Number(page)) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Number(pageSize))) : 20;
    const rows = await this.prisma.appointment.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { appointmentDate: 'desc' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
      include: {
        client: { select: { firstName: true, lastName: true } },
        consentRecord: { select: { status: true } },
      },
    });
    return rows.map((a) => ({
      ...a,
      clientName: a.client ? `${a.client.firstName} ${a.client.lastName}` : 'Client',
      consentStatus: a.consentRecord?.status ?? 'not_requested',
    }));
  }

  async getAppointment(tenantId: string, id: string) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id }
    });
    if (!apt || apt.tenantId !== tenantId || apt.deletedAt) throw new NotFoundException('Appointment not found');
    return apt;
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

    const asset = await this.prisma.imageAsset.create({
      data: {
        tenantId,
        appointmentId,
        s3Key: dto.storagePath, // Legacy column name; stores Firebase storage path
        s3Bucket: this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || '',
        s3ObjectHash: dto.fileHash,
        fileSizeBytes: Number(metadata.size || dto.fileSizeBytes || 0),
        isBeforePhoto,
        isAfterPhoto: !isBeforePhoto,
        uploadValidated: true,
      }
    });

    // Here we would push a job to BullMQ for validation/Cloudinary processing
    const validationJobId = uuidv4(); // Placeholder for actual BullMQ job ID

    return {
      imageId: asset.id,
      validationJobId,
    };
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
}
