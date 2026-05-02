import { IsString, IsOptional, IsEmail, IsBoolean } from 'class-validator';

export class CreateClientDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateClientDto extends CreateClientDto {}

export class UpsertConsentDto {
  @IsBoolean()
  allowShowFace: boolean;

  @IsBoolean()
  allowUseName: boolean;

  @IsBoolean()
  allowTagSocial: boolean;

  @IsBoolean()
  allowPlatformPromotion: boolean;

  @IsBoolean()
  allowInternalUse: boolean;

  @IsBoolean()
  allowMarketingContent: boolean;

  @IsString()
  consentMethod: string;
}

export class WithdrawConsentDto {
  @IsString()
  withdrawalReason: string;
}
