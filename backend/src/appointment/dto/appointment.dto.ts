import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString, IsEnum } from 'class-validator';

enum ServiceCategory {
  HAIR_COLOUR = 'hair_colour',
  HAIR_CUT_STYLE = 'hair_cut_style',
  HAIR_EXTENSIONS = 'hair_extensions',
  LASER_TREATMENTS = 'laser_treatments',
  INJECTABLES_COSMETIC = 'injectables_cosmetic',
  SKIN_TREATMENTS = 'skin_treatments',
  NAIL_SERVICES = 'nail_services',
  MAKEUP = 'makeup',
  LASHES_BROWS = 'lashes_brows',
  MASSAGE_BODY = 'massage_body',
  GENERAL = 'general'
}

export class CreateAppointmentDto {
  @IsString()
  clientId: string;

  @IsString()
  @IsOptional()
  consentRecordId?: string;

  @IsEnum(ServiceCategory)
  serviceCategory: ServiceCategory;

  @IsString()
  serviceName: string;

  @IsString()
  @IsOptional()
  serviceDescription?: string;

  @IsDateString()
  appointmentDate: string;

  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @IsNumber()
  @IsOptional()
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateAppointmentDto extends CreateAppointmentDto {}

export class CancelAppointmentDto {
  @IsString()
  cancellationReason: string;
}

export class UploadUrlRequestDto {
  @IsString()
  filename: string;

  @IsString()
  contentType: string;

  @IsBoolean()
  isBeforePhoto: boolean;
}

export class ConfirmUploadDto {
  @IsString()
  s3Key: string;

  @IsString()
  s3ObjectHash: string; // Used to prevent duplicates

  @IsNumber()
  fileSizeBytes: number;

  @IsBoolean()
  @IsOptional()
  isBeforePhoto?: boolean;
}
