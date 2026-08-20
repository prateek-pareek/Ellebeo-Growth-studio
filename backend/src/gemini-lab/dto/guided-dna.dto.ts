import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { MOODS, OBJECTIVES } from '../guided-dna/contract';

export class SaveGuidedDnaDto {
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  currentStep!: number;

  @IsObject()
  draft!: Record<string, unknown>;
}

export class SuggestIdentityDto {
  @IsOptional()
  @IsString()
  serviceCategory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class SuggestEssenceDto {
  @IsIn(MOODS as unknown as string[])
  mood!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];
}

export class SuggestAudienceDto {
  @IsOptional()
  @IsString()
  serviceCategory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];
}

export class SuggestStrategyDto {
  @IsOptional()
  @IsIn(OBJECTIVES as unknown as string[])
  objective?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];
}

export class DraftStoryDto {
  @IsObject()
  draft!: Record<string, unknown>;
}

export class ScanWebsiteDto {
  @IsUrl({ require_protocol: true })
  url!: string;
}
