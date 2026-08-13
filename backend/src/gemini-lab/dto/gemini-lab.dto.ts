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
