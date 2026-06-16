import { IsString, IsEnum, IsBoolean, IsOptional, IsNumber, Min } from 'class-validator';

export enum TenantStatus {
  ACTIVE = 'active',
  RESTRICTED = 'restricted',
  SUSPENDED = 'suspended',
  CHURNED = 'churned',
}

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status: TenantStatus;
}

export class ResolveFailedJobDto {
  @IsString()
  resolutionNotes: string;
}

export class UpdatePlanSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  generationsIncluded?: number;
}
