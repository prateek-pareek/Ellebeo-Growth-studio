import { IsString, IsOptional, IsEnum, IsArray, IsDateString } from 'class-validator';

enum PlatformType {
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok'
}

enum PostFormat {
  FEED = 'feed',
  STORY = 'story',
  REEL = 'reel',
  CAROUSEL = 'carousel'
}

export class SchedulePostDto {
  @IsString()
  contentItemId: string;

  @IsString()
  socialAccountId: string;

  @IsString()
  @IsOptional()
  campaignId?: string;

  @IsEnum(PlatformType)
  platform: PlatformType;

  @IsEnum(PostFormat)
  postFormat: PostFormat;

  @IsString()
  @IsOptional()
  captionOverride?: string;

  @IsArray()
  @IsOptional()
  hashtagsOverride?: string[];

  @IsDateString()
  scheduledFor: string;
}

export class UpdateScheduledPostDto {
  @IsDateString()
  @IsOptional()
  scheduledFor?: string;

  @IsString()
  @IsOptional()
  captionOverride?: string;

  @IsArray()
  @IsOptional()
  hashtagsOverride?: string[];
}
