import { Module } from '@nestjs/common';
import { CrmReaderService } from './crm-reader.service';
import { BookingImportService } from './booking-import.service';
import { CrmController } from './crm.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmController],
  providers: [CrmReaderService, BookingImportService],
  exports: [CrmReaderService, BookingImportService],
})
export class CrmModule {}
