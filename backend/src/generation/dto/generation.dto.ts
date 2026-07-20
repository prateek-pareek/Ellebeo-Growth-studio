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
  @IsOptional()
  appointmentId?: string;

  @IsString()
  @IsOptional()
  postType?: 'booking' | 'brand' | 'marketing';

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

  // Slug of the structural Template the tenant picked from the gallery (see
  // Template model / /templates API). Resolved server-side to that template's
  // rendererKey and passed to the orchestrator as a layout hint — the AI
  // layout agent is bypassed in favour of the tenant's explicit pick.
  @IsString()
  @IsOptional()
  templateSlug?: string;
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
