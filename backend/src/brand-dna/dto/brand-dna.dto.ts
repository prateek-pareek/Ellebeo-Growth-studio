import { IsString, IsOptional, IsArray, IsEnum, IsNumber, IsBoolean } from 'class-validator';

enum BrandAesthetic {
  MINIMALIST_CLEAN = 'minimalist_clean',
  MOODY_EDITORIAL = 'moody_editorial',
  BRIGHT_PLAYFUL = 'bright_playful',
  SOFT_FEMININE = 'soft_feminine',
  BOLD_LUXURY = 'bold_luxury'
}

enum BrandTier {
  LUXURY = 'luxury',
  MAINSTREAM = 'mainstream',
  ACCESSIBLE = 'accessible'
}

export class CreateBrandDnaDto {
  @IsString()
  businessName: string;

  @IsString()
  @IsOptional()
  oneLiner?: string;

  @IsString()
  @IsOptional()
  uniqueSellingProposition?: string;

  @IsString()
  @IsOptional()
  primaryPersona?: string;

  @IsString()
  @IsOptional()
  primaryTone?: string;

  @IsEnum(BrandAesthetic)
  @IsOptional()
  aestheticDirection?: BrandAesthetic;

  @IsEnum(BrandTier)
  @IsOptional()
  brandTier?: BrandTier;

  @IsArray()
  @IsOptional()
  pillars?: string[];

  @IsArray()
  @IsOptional()
  goals?: Array<{ label: string; target: string }>;
}

export class ScanInstagramDto {
  @IsString()
  handle: string;
}

export class ScanWebsiteDto {
  @IsString()
  url: string;
}
