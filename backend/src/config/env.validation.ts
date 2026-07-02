import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum AppEnv {
  development = 'development',
  test = 'test',
  production = 'production',
}

class EnvironmentVariables {
  @IsInt() @Min(1) @Max(65535)
  @IsOptional()
  PORT?: number;

  @IsEnum(AppEnv)
  @IsOptional()
  NODE_ENV?: AppEnv;

  @IsString() @IsOptional()
  FRONTEND_URL?: string;

  @IsString() @IsOptional()
  ADMIN_PORTAL_URL?: string;

  @IsString() @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString() @IsNotEmpty()
  REDIS_HOST!: string;

  @IsInt() @Min(1) @Max(65535)
  @IsOptional()
  REDIS_PORT?: number;

  @IsString() @IsOptional()
  REDIS_PASSWORD?: string;

  @IsOptional() @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional() @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional() @IsString()
  GEMINI_MODEL?: string;

  @IsOptional() @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsOptional() @IsString()
  FIREBASE_PROJECT_ID?: string;

  @IsOptional() @IsString()
  FIREBASE_CLIENT_EMAIL?: string;

  @IsOptional() @IsString()
  FIREBASE_PRIVATE_KEY?: string;

  @IsOptional() @IsString()
  FIREBASE_STORAGE_BUCKET?: string;

  @IsOptional() @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional() @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional() @IsString()
  CLOUDINARY_API_SECRET?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (validatedConfig.FIREBASE_PRIVATE_KEY) {
    process.env.FIREBASE_PRIVATE_KEY = validatedConfig.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  if (errors.length > 0) {
    const messages = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints || {}).join(', ')}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validatedConfig;
}
