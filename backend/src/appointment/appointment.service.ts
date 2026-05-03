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

  async getAppointments(tenantId: string) {
    return this.prisma.appointment.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { appointmentDate: 'desc' }
    });
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

    const path = `tenants/${tenantId}/appointments/${appointmentId}/${uuidv4()}-${dto.filename}`;
    const file = this.bucket.file(path);

    // Generate signed URL for resumable upload (POST/PUT)
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      contentType: dto.contentType,
    });

    return {
      uploadUrl,
      storagePath: path,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  async confirmUpload(tenantId: string, appointmentId: string, dto: ConfirmUploadDto, isBeforePhoto: boolean) {
    await this.getAppointment(tenantId, appointmentId);

    const existing = await this.prisma.imageAsset.findFirst({
      where: { s3ObjectHash: dto.s3ObjectHash, deletedAt: null } // Column name still s3ObjectHash in schema, keeping for now or renaming logic
    });
    if (existing) {
      throw new BadRequestException('Image already exists (duplicate hash)');
    }

    const asset = await this.prisma.imageAsset.create({
      data: {
        tenantId,
        appointmentId,
        s3Key: dto.s3Key, // Column name s3Key in schema, mapping to firebase path
        s3Bucket: this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || '',
        s3ObjectHash: dto.s3ObjectHash,
        fileSizeBytes: dto.fileSizeBytes,
        isBeforePhoto,
        isAfterPhoto: !isBeforePhoto,
        uploadValidated: false,
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
