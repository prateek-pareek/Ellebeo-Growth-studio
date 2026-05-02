import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  locale?: string;
}

export class CompleteOnboardingDto {
  @IsNumber()
  step: number;
}
