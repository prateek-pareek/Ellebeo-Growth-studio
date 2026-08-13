import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { VIDEO_OBJECTIVES, type VideoObjective } from '../contract';

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
}
