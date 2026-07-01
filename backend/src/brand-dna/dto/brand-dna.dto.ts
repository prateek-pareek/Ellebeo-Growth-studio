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

  @IsArray()
  @IsOptional()
  serviceCategories?: string[];

  @IsString()
  @IsOptional()
  serviceArea?: string;

  @IsString()
  @IsOptional()
  reputationAsset?: string;

  @IsString()
  @IsOptional()
  workDifferentiation?: string;

  @IsString()
  @IsOptional()
  brandEssenceSentence?: string;

  @IsString()
  @IsOptional()
  brandWorldAnchor?: string;

  @IsString()
  @IsOptional()
  imageEnergy?: string;

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
  backgroundBrandColor?: string;

  @IsString()
  @IsOptional()
  accentBrandColor?: string;

  @IsString()
  @IsOptional()
  depthBrandColor?: string;

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

  // Visual Brand DNA
  @IsArray()
  @IsOptional()
  moodboardUrls?: string[];

  @IsArray()
  @IsOptional()
  moodboardLabels?: string[];

  @IsArray()
  @IsOptional()
  visualRanking?: string[];

  @IsString()
  @IsOptional()
  lightingPreference?: string;

  @IsString()
  @IsOptional()
  texturePreference?: string;

  @IsString()
  @IsOptional()
  compositionStyle?: string;

  @IsString()
  @IsOptional()
  environmentPreference?: string;

  @IsString()
  @IsOptional()
  finishPreference?: string;

  @IsString()
  @IsOptional()
  audienceLifestyle?: string;

  @IsString()
  @IsOptional()
  commercialObjective?: string;

  // Deeper ICP
  @IsString()
  @IsOptional()
  clientFears?: string;

  @IsString()
  @IsOptional()
  clientTrustTriggers?: string;

  @IsString()
  @IsOptional()
  clientVisualTaste?: string;

  @IsString()
  @IsOptional()
  clientBuyingTriggers?: string;

  @IsString()
  @IsOptional()
  clientEmotionalOutcome?: string;

  // Brand perception
  @IsString()
  @IsOptional()
  brandPerceptionGoal?: string;

  @IsString()
  @IsOptional()
  brandProofStatement?: string;

  @IsString()
  @IsOptional()
  brandNeverLooksLike?: string;
}

export class ScanInstagramDto {
  @IsString()
  handle: string;
}

export class ScanWebsiteDto {
  @IsString()
  url: string;
}
