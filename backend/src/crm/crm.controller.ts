import {
  Controller,
  Post,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingImportService } from './booking-import.service';
import { CrmReaderService } from './crm-reader.service';

@Controller('crm')
@UseGuards(JwtAuthGuard)
export class CrmController {
  constructor(
    private readonly bookingImport: BookingImportService,
    private readonly crmReader: CrmReaderService,
  ) {}

  @Post('bookings/:bookingId/import')
  @HttpCode(HttpStatus.CREATED)
  importBooking(
    @Request() req: any,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.bookingImport.importBooking(req.user.tenantId, bookingId);
  }

  @Post('bookings/import-all')
  @HttpCode(HttpStatus.OK)
  importAll(@Request() req: any) {
    // technicianId is the same as the user's CRM technician ID
    return this.bookingImport.importAllBookingsForTenant(
      req.user.tenantId,
      req.user.sub,
    );
  }

  @Get('bookings/:bookingId')
  previewBooking(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.crmReader.getBookingById(bookingId);
  }
}
