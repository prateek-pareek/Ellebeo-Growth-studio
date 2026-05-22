import {
  Injectable,
  Logger,
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

  async importBooking(tenantId: string, bookingId: string) {
    // Guard: already imported?
    const existing = await this.prisma.appointment.findFirst({
      where: { tenantId, crmBookingId: bookingId },
    });
    if (existing) {
      throw new ConflictException(`Booking ${bookingId} already imported as appointment ${existing.id}`);
    }

    const booking = await this.crmReader.getBookingById(bookingId);
    if (!booking) {
      throw new NotFoundException(`CRM booking ${bookingId} not found`);
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
          status: 'granted',
          allowShowFace,
          allowUseName,
          allowTagSocial,
          allowPlatformPromotion,
          allowInternalUse: false,
          allowMarketingContent,
          consentMethod: 'crm',
          grantedAt: new Date(),
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

      // 5. Link consent to appointment (update appointment with consentRecordId)
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { consentRecordId: consentRecord.id },
      });

      this.logger.log(`Imported CRM booking ${bookingId} → appointment ${appointment.id} for tenant ${tenantId}`);

      return {
        appointmentId: appointment.id,
        clientId: client.id,
        consentRecordId: consentRecord.id,
        questionnaireCount: questionnaire ? Object.keys(questionnaire.data as object).length : 0,
      };
    });
  }

  async importAllBookingsForTenant(tenantId: string, technicianId: string) {
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
