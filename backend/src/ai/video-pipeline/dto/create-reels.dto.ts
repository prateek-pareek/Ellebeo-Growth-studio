import { IsArray, IsIn, IsInt, IsOptional, IsUrl, Max, Min } from 'class-validator';
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
}
