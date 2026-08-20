import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const emptyToUndef = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : value;

export const GEMINI_LAB_ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9'] as const;
export type GeminiLabAspectRatio = (typeof GEMINI_LAB_ASPECT_RATIOS)[number];

export class GeminiLabGenerateDto {
  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  templateSlug?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  appointmentId?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  overlayText?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  extraNotes?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn(GEMINI_LAB_ASPECT_RATIOS)
  aspectRatio?: GeminiLabAspectRatio;

  /** Used when no gallery template is selected. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(5)
  slideCount?: number;

  /** "true" / "false" from multipart form. Defaults to true when omitted. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === true || value === 'true' || value === '1';
  })
  useBrandDna?: boolean;

  /**
   * A real client review, in the client's own words. Supplying this is the
   * only way the testimonial format becomes available — the generator will
   * not compose a quote and attribute it to a customer.
   */
  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  testimonial?: string;

  /**
   * Photo finishing: off | natural | polished | editorial. Global tonal
   * correction only (exposure, white balance, contrast, sharpening) — the
   * subject is never altered, and a before/after pair always receives one
   * identical grade so the comparison stays honest.
   */
  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn(['off', 'natural', 'polished', 'editorial'])
  photoFinish?: string;

  /**
   * Real sale/offer/price/availability facts, in the technician's own words —
   * "20% off lash refills, Tue-Thu, ends 31 Aug". Supplying this is what
   * unlocks the commercial formats: without it the generator would have to
   * invent a discount, which it refuses to do.
   */
  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  offerDetails?: string;

  /**
   * Which KIND of post to make (statement, process, tips, myth, menu...).
   * Omitted means the server picks, weighted away from what this brand was
   * served recently.
   */
  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  postFormat?: string;

  /** look | bts | before | after | detail — photo 1 is not assumed to be a before shot. */
  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn(['look', 'bts', 'before', 'after', 'detail'])
  photo1Kind?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn(['look', 'bts', 'before', 'after', 'detail'])
  photo2Kind?: string;
}

/**
 * The option the technician actually picked.
 *
 * Posted after a choice is made, not during generation. Until this existed the
 * pipeline recorded the option it PROMOTED and called that the brand's taste,
 * which meant a studio could pick option 4 every single time and the system
 * would keep learning option 1.
 */
export class GeminiLabSelectionDto {
  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  photoMode?: string;

  @IsOptional()
  @IsString()
  layout?: string;

  @IsOptional()
  @IsString()
  photoShape?: string;

  @IsOptional()
  @IsString()
  decoration?: string;

  @IsOptional()
  @IsString()
  paletteTreatment?: string;

  @IsOptional()
  @IsString()
  typePairing?: string;
}

/** A post the studio wants to keep, optionally with the date it is planned for. */
export class GeminiLabKeepDto {
  @IsString()
  imageDataUrl!: string;

  @IsOptional() @IsString() format?: string;
  @IsOptional() @IsString() photoMode?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() paletteTreatment?: string;
  @IsOptional() @IsString() typePairing?: string;
  @IsOptional() @IsString() aspectRatio?: string;
  @IsOptional() @IsString() headline?: string;

  /** hook / body / cta / hashtags, as shown in the caption panel. */
  @IsOptional()
  caption?: unknown;

  /** ISO date. Absent means kept but not planned yet. */
  @IsOptional() @IsString() scheduledFor?: string;
}
