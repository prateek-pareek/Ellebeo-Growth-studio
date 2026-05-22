import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CrmBooking {
  id: string;
  technicianId: string;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  category: string | null;
  serviceName: string | null;
  confirmedStartTime: Date | null;
  recipientConsentData: Record<string, unknown> | null;
  recipientIntakeData: Record<string, unknown> | null;
  marketingImageConsent: boolean;
}

export interface CrmQuestionnaire {
  id: string;
  bookingId: string;
  category: string;
  data: Record<string, unknown>;
}

export interface CrmPortfolioMedia {
  id: string;
  technicianId: string;
  url: string;
  displayOrder: number;
}

export interface CrmTechnicianInfo {
  id: string;
  email: string | null;
  businessName: string | null;
}

@Injectable()
export class CrmReaderService {
  private readonly logger = new Logger(CrmReaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBookingById(bookingId: string): Promise<CrmBooking | null> {
    const rows = await this.prisma.$queryRaw<CrmBooking[]>`
      SELECT
        b.id::text,
        b."technicianId"::text AS "technicianId",
        b."recipientName" AS "recipientName",
        b."recipientEmail" AS "recipientEmail",
        b."recipientPhone" AS "recipientPhone",
        b.category::text AS category,
        b."serviceName" AS "serviceName",
        b."confirmedStartTime" AS "confirmedStartTime",
        b."recipientConsentData" AS "recipientConsentData",
        b."recipientIntakeData" AS "recipientIntakeData",
        b."marketingImageConsent" AS "marketingImageConsent"
      FROM public."Booking" b
      WHERE b.id = ${bookingId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async getBookingsForTechnician(
    technicianId: string,
    limit = 50,
    offset = 0,
  ): Promise<CrmBooking[]> {
    return this.prisma.$queryRaw<CrmBooking[]>`
      SELECT
        b.id::text,
        b."technicianId"::text AS "technicianId",
        b."recipientName" AS "recipientName",
        b."recipientEmail" AS "recipientEmail",
        b."recipientPhone" AS "recipientPhone",
        b.category::text AS category,
        b."serviceName" AS "serviceName",
        b."confirmedStartTime" AS "confirmedStartTime",
        b."recipientConsentData" AS "recipientConsentData",
        b."recipientIntakeData" AS "recipientIntakeData",
        b."marketingImageConsent" AS "marketingImageConsent"
      FROM public."Booking" b
      WHERE b."technicianId" = ${technicianId}::uuid
        AND b."marketingImageConsent" = true
      ORDER BY b."confirmedStartTime" DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  async getQuestionnaireForBooking(bookingId: string): Promise<CrmQuestionnaire | null> {
    const rows = await this.prisma.$queryRaw<CrmQuestionnaire[]>`
      SELECT
        r.id::text,
        r."bookingId"::text AS "bookingId",
        r.category::text AS category,
        r.data AS data
      FROM public."BookingConsultationRecord" r
      WHERE r."bookingId" = ${bookingId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async getPortfolioMediaForTechnician(technicianId: string): Promise<CrmPortfolioMedia[]> {
    return this.prisma.$queryRaw<CrmPortfolioMedia[]>`
      SELECT
        m.id::text,
        m."technicianId"::text AS "technicianId",
        m.url AS url,
        m."displayOrder" AS "displayOrder"
      FROM public."TechnicianPortfolioMedia" m
      WHERE m."technicianId" = ${technicianId}::uuid
      ORDER BY m."displayOrder" ASC
    `;
  }

  async getTechnicianInfo(technicianId: string): Promise<CrmTechnicianInfo | null> {
    const rows = await this.prisma.$queryRaw<CrmTechnicianInfo[]>`
      SELECT
        t.id::text,
        t.email AS email,
        t."businessName" AS "businessName"
      FROM public."Technician" t
      WHERE t.id = ${technicianId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
