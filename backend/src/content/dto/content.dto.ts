import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';

enum ContentStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  BLOCKED = 'blocked',
  FLAGGED = 'flagged',
  ARCHIVED = 'archived',
  FAILED = 'failed'
}

enum PlatformType {
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok'
}

enum ServiceCategory {
  HAIR_COLOUR = 'hair_colour',
  HAIR_CUT_STYLE = 'hair_cut_style',
  HAIR_EXTENSIONS = 'hair_extensions',
  LASER_TREATMENTS = 'laser_treatments',
  INJECTABLES_COSMETIC = 'injectables_cosmetic',
  SKIN_TREATMENTS = 'skin_treatments',
  NAIL_SERVICES = 'nail_services',
  MAKEUP = 'makeup',
  LASHES_BROWS = 'lashes_brows',
  MASSAGE_BODY = 'massage_body',
  GENERAL = 'general'
}

export class GetContentQueryDto {
  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;

  @IsEnum(PlatformType)
  @IsOptional()
  platform?: PlatformType;

  @IsEnum(ServiceCategory)
  @IsOptional()
  serviceCategory?: ServiceCategory;

  @IsString()
  @IsOptional()
  dateFrom?: string;

  @IsString()
  @IsOptional()
  dateTo?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  pageSize?: string;

  @IsString()
  @IsOptional()
  jobId?: string;
}

enum ToneRating {
  SOUNDS_LIKE_ME = 'sounds_like_me',
  CLOSE_BUT_NOT_QUITE = 'close_but_not_quite',
  DOESNT_SOUND_LIKE_ME = 'doesnt_sound_like_me'
}

export class RateContentDto {
  @IsEnum(ToneRating)
  rating: ToneRating;
}

export class SelectOptionDto {
  @IsNumber()
  optionIndex: number;
}
