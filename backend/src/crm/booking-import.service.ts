import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrmReaderService } from './crm-reader.service';

@Injectable()
export class BookingImportService {
  private readonly logger = new Logger(BookingImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmReader: CrmReaderService,
  ) {}

  private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async importBooking(tenantId: string, bookingId: string) {
    // Guard: already imported?
    const existing = BookingImportService.UUID_RE.test(bookingId)
      ? await this.prisma.appointment.findFirst({ where: { tenantId, crmBookingId: bookingId } })
      : null;
    if (existing) {
      throw new ConflictException(`Booking ${bookingId} already imported as appointment ${existing.id}`);
    }

    const booking = await this.crmReader.getBookingById(bookingId);
    if (!booking) {
      throw new NotFoundException(`CRM booking ${bookingId} not found`);
    }

    if (booking.confirmedStartTime && booking.confirmedStartTime > new Date()) {
      throw new BadRequestException('Cannot import an upcoming booking — wait until the appointment is completed');
    }

    const questionnaire = await this.crmReader.getQuestionnaireForBooking(bookingId);

    // Parse consent from CRM booking
    const consentData = booking.recipientConsentData ?? {};
    const allowShowFace = booking.marketingImageConsent;
    const allowUseName = !!(consentData['use_name'] ?? consentData['allowUseName'] ?? true);
    const allowTagSocial = !!(consentData['tag_social'] ?? consentData['allowTagSocial'] ?? false);
    const allowPlatformPromotion = !!(consentData['platform_promotion'] ?? consentData['allowPlatformPromotion'] ?? false);
    const allowMarketingContent = booking.marketingImageConsent;

    // Split recipient name
    const nameParts = (booking.recipientName ?? 'Client').trim().split(/\s+/);
    const firstName = nameParts[0] ?? 'Client';
    const lastName = nameParts.slice(1).join(' ') || 'CRM';

    return this.prisma.$transaction(async (tx) => {
      // 1. Create or find client
      let client = booking.recipientEmail
        ? await tx.client.findFirst({
            where: { tenantId, email: booking.recipientEmail },
          })
        : null;

      if (!client) {
        client = await tx.client.create({
          data: {
            tenantId,
            firstName,
            lastName,
            email: booking.recipientEmail ?? undefined,
            phone: booking.recipientPhone ?? undefined,
          },
        });
      }

      // 2. Create appointment (source = 'crm')
      const appointment = await tx.appointment.create({
        data: {
          tenantId,
          clientId: client.id,
          serviceCategory: booking.category ?? 'general',
          serviceName: booking.serviceName ?? 'CRM Booking',
          appointmentDate: booking.confirmedStartTime ?? new Date(),
          source: 'crm',
          crmBookingId: bookingId,
          externalId: bookingId,
        },
      });

      // 3. Create consent record from CRM consent data
      const consentRecord = await tx.consentRecord.create({
        data: {
          tenantId,
          clientId: client.id,
          appointmentId: appointment.id,
          status: allowMarketingContent ? 'granted' : 'declined',
          allowShowFace,
          allowUseName,
          allowTagSocial,
          allowPlatformPromotion,
          allowInternalUse: false,
          allowMarketingContent,
          consentMethod: 'crm',
          grantedAt: allowMarketingContent ? new Date() : undefined,
          crmBookingId: bookingId,
        },
      });

      // 4. Import questionnaire answers
      if (questionnaire?.data && typeof questionnaire.data === 'object') {
        const entries = Object.entries(questionnaire.data as Record<string, unknown>);
        if (entries.length > 0) {
          await tx.appointmentQuestionnaireResponse.createMany({
            data: entries.map(([key, value]) => ({
              appointmentId: appointment.id,
              crmBookingId: bookingId,
              questionKey: key,
              answer: value != null ? String(value) : null,
            })),
          });
        }
      }

      // 5. Auto-import before/after photos from recipientIntakeData
      const intake = booking.recipientIntakeData as Record<string, unknown> | null;
      // After photo is stored at top-level: recipientIntakeData.afterPhotoUrl
      const afterUrl = intake?.afterPhotoUrl as string | undefined;
      // Before photo is stored nested inside service-category key: recipientIntakeData.skinData.beforePhotoUrl
      const SERVICE_DATA_KEYS = ['skinData', 'hairData', 'nailsData', 'injectablesData', 'browsLashesData', 'bodyData', 'wellnessData'];
      const beforeUrl = SERVICE_DATA_KEYS
        .map(k => (intake?.[k] as Record<string, unknown> | undefined)?.beforePhotoUrl as string | undefined)
        .find(Boolean);
      let imageCount = 0;

      if (beforeUrl) {
        await tx.imageAsset.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            rawUrl: beforeUrl,
            assetType: 'image',
            isBeforePhoto: true,
            isAfterPhoto: false,
            uploadValidated: true,
            source: 'crm',
          },
        });
        imageCount++;
      }
      if (afterUrl) {
        await tx.imageAsset.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            rawUrl: afterUrl,
            assetType: 'image',
            isBeforePhoto: false,
            isAfterPhoto: true,
            uploadValidated: true,
            source: 'crm',
          },
        });
        imageCount++;
      }

      // 6. Link consent to appointment
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { consentRecordId: consentRecord.id },
      });

      this.logger.log(`Imported CRM booking ${bookingId} → appointment ${appointment.id} for tenant ${tenantId}`);

      return {
        appointmentId: appointment.id,
        clientId: client.id,
        consentRecordId: consentRecord.id,
        imageCount,
        questionnaireCount: questionnaire ? Object.keys(questionnaire.data as object).length : 0,
      };
    });
  }

  private async resolveEmail(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ?? null;
  }

  async listBookingsWithStatus(
    tenantId: string,
    userId: string,
    limit = 20,
    offset = 0,
  ) {
    const technicianEmail = await this.resolveEmail(userId);
    if (!technicianEmail) return { bookings: [], total: 0, technicianFound: false };
    const technician = await this.crmReader.getTechnicianByEmail(technicianEmail);
    if (!technician) {
      return { bookings: [], total: 0, technicianFound: false };
    }

    const [bookings, total] = await Promise.all([
      this.crmReader.getBookingsForTechnician(technician.id, limit, offset),
      this.crmReader.countBookingsForTechnician(technician.id),
    ]);

    if (bookings.length === 0) {
      return { bookings: [], total, technicianFound: true };
    }

    // Check which bookings are already imported
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bookingIds = bookings.map((b) => b.id);
    const uuidBookingIds = bookingIds.filter((id) => UUID_RE.test(id));
    const imported = uuidBookingIds.length > 0
      ? await this.prisma.appointment.findMany({
          where: { tenantId, crmBookingId: { in: uuidBookingIds } },
          select: { crmBookingId: true, id: true },
        })
      : [];
    const importedMap = new Map(imported.map((a) => [a.crmBookingId, a.id]));

    return {
      bookings: bookings.map((b) => ({
        ...b,
        imported: importedMap.has(b.id),
        appointmentId: importedMap.get(b.id) ?? null,
      })),
      total,
      technicianFound: true,
    };
  }

  async importAllBookingsForTenant(tenantId: string, userId: string) {
    const technicianEmail = await this.resolveEmail(userId);
    if (!technicianEmail) return [];
    const technician = await this.crmReader.getTechnicianByEmail(technicianEmail);
    if (!technician) return [];
    const technicianId = technician.id;
    const bookings = await this.crmReader.getBookingsForTechnician(technicianId);
    const results = [];

    for (const booking of bookings) {
      try {
        const result = await this.importBooking(tenantId, booking.id);
        results.push({ bookingId: booking.id, status: 'imported', ...result });
      } catch (err: any) {
        if (err instanceof ConflictException) {
          results.push({ bookingId: booking.id, status: 'already_imported' });
        } else {
          this.logger.warn(`Failed to import booking ${booking.id}: ${err.message}`);
          results.push({ bookingId: booking.id, status: 'failed', error: err.message });
        }
      }
    }

    return results;
  }
}
