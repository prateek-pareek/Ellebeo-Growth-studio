import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
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
  APP_PORT!: number;

  @IsEnum(AppEnv)
  APP_ENV!: AppEnv;

  @IsUrl()
  APP_URL!: string;

  @IsUrl()
  FRONTEND_URL!: string;

  @IsString() @IsNotEmpty()
  ALLOWED_ORIGINS!: string;

  @IsString() @IsNotEmpty()
  DATABASE_URL!: string;

  @IsInt() @Min(1)
  DATABASE_POOL_MIN!: number;

  @IsInt() @Min(1)
  DATABASE_POOL_MAX!: number;

  @IsString() @IsNotEmpty()
  REDIS_URL!: string;

  @IsString() @IsNotEmpty()
  REDIS_PASSWORD!: string;

  @IsString() @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString() @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString() @IsNotEmpty()
  JWT_ACCESS_EXPIRY!: string;

  @IsString() @IsNotEmpty()
  JWT_REFRESH_EXPIRY!: string;

  @IsInt() @Min(8) @Max(16)
  BCRYPT_ROUNDS!: number;

  @IsString() @IsNotEmpty()
  FIREBASE_PROJECT_ID!: string;

  @IsString() @IsNotEmpty()
  FIREBASE_CLIENT_EMAIL!: string;

  @IsString() @IsNotEmpty()
  FIREBASE_PRIVATE_KEY!: string;

  @IsString() @IsNotEmpty()
  FIREBASE_STORAGE_BUCKET!: string;

  @IsOptional() @IsString()
  FIREBASE_DATABASE_URL?: string;
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
