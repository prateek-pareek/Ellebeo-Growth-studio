import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUrl, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GetVideoPlansQueryDto {
  @IsString()
  @IsOptional()
  status?: string;
}

export class SceneEditDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsString()
  @IsOptional()
  headline?: string | null;

  @IsString()
  @IsOptional()
  caption?: string | null;

  @IsUrl()
  @IsOptional()
  assetUrl?: string;
}

export class UpdateVideoPlanDto {
  /** New scene order, expressed as the OLD scene indices in their new order. Omit to leave order unchanged. */
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  sceneOrder?: number[];

  /** Partial per-scene field edits (headline/caption/assetUrl), keyed by current scene index. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneEditDto)
  @IsOptional()
  scenes?: SceneEditDto[];

  @IsBoolean()
  @IsOptional()
  voiceoverEnabled?: boolean;

  @IsString()
  @IsOptional()
  musicMood?: string | null;
}
