import { IsString, IsOptional, IsEnum, IsDateString, IsArray } from 'class-validator';

enum BusinessGoalType {
  ATTRACT_NEW_CLIENTS = 'attract_new_clients',
  FILL_QUIET_DAYS = 'fill_quiet_days',
  PROMOTE_HIGH_MARGIN_SERVICE = 'promote_high_margin_service',
  BUILD_BRAND_AUTHORITY = 'build_brand_authority',
  CLIENT_RETENTION = 'client_retention'
}

export class CreateCampaignDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(BusinessGoalType)
  @IsOptional()
  goalType?: BusinessGoalType;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class UpdateCampaignDto extends CreateCampaignDto {}

export class AddContentToCampaignDto {
  @IsArray()
  contentItemIds: string[];
}

export class ApplyScheduleDto {
  // Complex schedule application DTO, we'll keep it simple for now
  @IsArray()
  scheduleSelections: any[];
}
