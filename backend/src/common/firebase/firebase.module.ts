import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      useFactory: (configService: ConfigService) => {
        const serviceAccountPath = configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
        
        // Use default credentials or service account JSON
        if (serviceAccountPath) {
          return admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
            storageBucket: configService.get<string>('FIREBASE_STORAGE_BUCKET'),
          });
        } else {
          // Fallback for dev/production with env vars directly if preferred
          return admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            storageBucket: configService.get<string>('FIREBASE_STORAGE_BUCKET'),
          });
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
