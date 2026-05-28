import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
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

  @Get('bookings')
  listBookings(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.bookingImport.listBookingsWithStatus(
      req.user.tenantId,
      req.user.userId,
      limit,
      offset,
    );
  }

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
    return this.bookingImport.importAllBookingsForTenant(
      req.user.tenantId,
      req.user.userId,
    );
  }

  @Get('bookings/:bookingId')
  previewBooking(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.crmReader.getBookingById(bookingId);
  }
}
