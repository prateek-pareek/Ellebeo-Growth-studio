import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';

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
