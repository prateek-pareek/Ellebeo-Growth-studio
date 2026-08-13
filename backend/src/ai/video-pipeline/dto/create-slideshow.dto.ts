import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { MAX_SCENES, VIDEO_OBJECTIVES, type VideoObjective } from '../contract';

export class CreateSlideshowDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({}, { each: true })
  imageUrls!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  headlines?: string[];

  @IsOptional()
  @IsIn([...VIDEO_OBJECTIVES])
  objective?: VideoObjective;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SCENES)
  sceneCount?: number;
}
