import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { MAX_SCENES, VIDEO_OBJECTIVES, type VideoObjective } from '../contract';

export class CreateReelsDto {
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  clipUrls?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SCENES)
  sceneCount?: number;

  @IsOptional()
  @IsIn([...VIDEO_OBJECTIVES])
  objective?: VideoObjective;

  /** Phase 7 opt-in: try Gemini/Veo AI clips for scenes with no technician
   * image or stock isn't the right fit. Still gated by GROWTH_STUDIO_VIDEO_AI_CLIPS
   * and skipped outright for medical-aesthetics brands. */
  @IsOptional()
  @IsBoolean()
  useAiClips?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clipPrompts?: string[];
}
