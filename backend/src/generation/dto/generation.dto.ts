import { IsString, IsOptional, IsBoolean, IsArray, IsEnum, MaxLength, ArrayMinSize } from 'class-validator';

enum PostFormat {
  FEED = 'feed',
  STORY = 'story',
  REEL = 'reel',
  CAROUSEL = 'carousel',
  TIKTOK = 'tiktok',
  CAPTION = 'caption'
}

enum PlatformType {
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok'
}

export class GenerateContentDto {
  @IsString()
  appointmentId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PostFormat, { each: true })
  outputFormats: PostFormat[];

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PlatformType, { each: true })
  platforms: PlatformType[];

  @IsBoolean()
  includeVoiceover: boolean;

  @IsBoolean()
  includeMusic: boolean;

  @IsString()
  @IsOptional()
  goal?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  customInstruction?: string;
}

export class TweakContentDto {
  @IsString()
  contentItemId: string;

  @IsString()
  @MaxLength(500)
  tweakInstruction: string;

  @IsEnum(['caption', 'hashtags', 'all'])
  component: 'caption' | 'hashtags' | 'all';
}
