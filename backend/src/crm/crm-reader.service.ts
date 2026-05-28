import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CrmBooking {
  id: string;
  technicianId: string | null;
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
        b.id,
        b."technicianId",
        COALESCE(b."recipientName", ru."fullName", bu."fullName") AS "recipientName",
        COALESCE(b."recipientEmail", ru.email, bu.email)          AS "recipientEmail",
        b."recipientMobile" AS "recipientPhone",
        b.category::text AS category,
        ts."title" AS "serviceName",
        b."confirmedStartTime",
        b."recipientConsentData",
        b."recipientIntakeData",
        b."marketingImageConsent"
      FROM public."Booking" b
      LEFT JOIN public."TechnicianService" ts ON ts.id = b."technicianServiceId"
      LEFT JOIN public."User" ru ON ru.id = b."recipientUserId"
      LEFT JOIN public."User" bu ON bu.id = b."bookerUserId"
      WHERE b.id = ${bookingId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async getBookingsForTechnician(
    technicianId: string,
    limit = 200,
    offset = 0,
  ): Promise<CrmBooking[]> {
    return this.prisma.$queryRaw<CrmBooking[]>`
      SELECT
        b.id,
        b."technicianId",
        COALESCE(b."recipientName", ru."fullName", bu."fullName") AS "recipientName",
        COALESCE(b."recipientEmail", ru.email, bu.email)          AS "recipientEmail",
        b."recipientMobile" AS "recipientPhone",
        b.category::text AS category,
        ts."title" AS "serviceName",
        b."confirmedStartTime",
        b."recipientConsentData",
        b."recipientIntakeData",
        b."marketingImageConsent"
      FROM public."Booking" b
      LEFT JOIN public."TechnicianService" ts ON ts.id = b."technicianServiceId"
      LEFT JOIN public."User" ru ON ru.id = b."recipientUserId"
      LEFT JOIN public."User" bu ON bu.id = b."bookerUserId"
      WHERE b."technicianId" = ${technicianId}
      ORDER BY b."confirmedStartTime" DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  async getQuestionnaireForBooking(bookingId: string): Promise<CrmQuestionnaire | null> {
    const rows = await this.prisma.$queryRaw<CrmQuestionnaire[]>`
      SELECT
        r.id,
        r."bookingId",
        r.category::text AS category,
        r.data
      FROM public."BookingConsultationRecord" r
      WHERE r."bookingId" = ${bookingId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async getPortfolioMediaForTechnician(technicianId: string): Promise<CrmPortfolioMedia[]> {
    return this.prisma.$queryRaw<CrmPortfolioMedia[]>`
      SELECT
        m.id,
        m."technicianId",
        m.url,
        m."displayOrder"
      FROM public."TechnicianPortfolioMedia" m
      WHERE m."technicianId" = ${technicianId}
      ORDER BY m."displayOrder" ASC
    `;
  }

  async getTechnicianByEmail(email: string): Promise<CrmTechnicianInfo | null> {
    const rows = await this.prisma.$queryRaw<CrmTechnicianInfo[]>`
      SELECT
        tp.id,
        u.email,
        tp."displayName" AS "businessName"
      FROM public."User" u
      JOIN public."TechnicianProfile" tp ON tp."userId" = u.id
      WHERE u.email = ${email}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async countBookingsForTechnician(technicianId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM public."Booking" b
      WHERE b."technicianId" = ${technicianId}
    `;
    return Number(rows[0]?.count ?? 0);
  }
}
