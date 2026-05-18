import { IsEnum, IsString, IsBoolean, IsOptional } from 'class-validator';
import { PromptCategory } from '@prisma/client';

export class CreateMasterPromptDto {
  @IsEnum(PromptCategory)
  category: PromptCategory;

  @IsString()
  systemPrompt: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateMasterPromptDto {
  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
