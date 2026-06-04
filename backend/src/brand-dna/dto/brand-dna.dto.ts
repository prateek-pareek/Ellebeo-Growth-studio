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
  personaAge?: string;

  @IsString()
  @IsOptional()
  secondaryPersona?: string;

  @IsString()
  @IsOptional()
  personaLocation?: string;

  @IsString()
  @IsOptional()
  primaryTone?: string;

  @IsArray()
  @IsOptional()
  voiceDo?: string[];

  @IsArray()
  @IsOptional()
  voiceDont?: string[];

  @IsEnum(BrandAesthetic)
  @IsOptional()
  aestheticDirection?: BrandAesthetic;

  @IsEnum(BrandTier)
  @IsOptional()
  brandTier?: BrandTier;

  @IsString()
  @IsOptional()
  primaryBrandColor?: string;

  @IsString()
  @IsOptional()
  secondaryBrandColor?: string;

  @IsString()
  @IsOptional()
  emojiPolicy?: string;

  @IsString()
  @IsOptional()
  captionLengthPreference?: string;

  @IsArray()
  @IsOptional()
  pillars?: string[];

  @IsArray()
  @IsOptional()
  goals?: Array<{ label: string; target: string }>;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  logoPosition?: string;
}

export class ScanInstagramDto {
  @IsString()
  handle: string;
}

export class ScanWebsiteDto {
  @IsString()
  url: string;
}
