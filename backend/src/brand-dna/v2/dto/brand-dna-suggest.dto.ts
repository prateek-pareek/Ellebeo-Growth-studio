import { IsArray, IsOptional, IsString, ArrayMaxSize } from 'class-validator';

export class SuggestIdentityDto {
  @IsString()
  serviceCategory: string;

  @IsArray()
  @IsOptional()
  services?: string[];

  @IsString()
  @IsOptional()
  logoAssetId?: string;
}

export class SuggestEssenceDto {
  @IsString()
  mood: string;

  @IsArray()
  @IsOptional()
  services?: string[];
}

export class SuggestAudienceDto {
  @IsString()
  serviceCategory: string;

  @IsArray()
  @IsOptional()
  services?: string[];
}

export class SuggestStrategyDto {
  @IsString()
  @IsOptional()
  objective?: string;

  @IsArray()
  @IsOptional()
  services?: string[];
}

export class DraftStoryDto {
  @IsString()
  @IsOptional()
  brandName?: string;

  @IsString()
  @IsOptional()
  mood?: string;

  @IsArray()
  @ArrayMaxSize(3)
  @IsOptional()
  essence?: string[];

  @IsString()
  @IsOptional()
  serviceCategory?: string;

  @IsString()
  @IsOptional()
  objective?: string;
}
