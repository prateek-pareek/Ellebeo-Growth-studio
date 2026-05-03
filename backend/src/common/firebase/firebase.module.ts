import { Global, Module } from '@nestjs/common';
import { getFirebaseApp } from '../../config/firebase.config';

@Global()
@Module({
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      useFactory: () => getFirebaseApp(),
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
