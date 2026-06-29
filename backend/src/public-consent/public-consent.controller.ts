import { Controller, Get, Post, Query, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { PublicConsentService } from './public-consent.service';
import { IsBoolean } from 'class-validator';

class GrantConsentDto {
  @IsBoolean() allowShowFace: boolean;
  @IsBoolean() allowUseName: boolean;
  @IsBoolean() allowTagSocial: boolean;
  @IsBoolean() allowPlatformPromotion: boolean;
  @IsBoolean() allowInternalUse: boolean;
  @IsBoolean() allowMarketingContent: boolean;
}

@Controller('public/consent')
export class PublicConsentController {
  constructor(private readonly service: PublicConsentService) {}

  @Get()
  getConsent(@Query('token') token: string) {
    return this.service.getConsentByToken(token);
  }

  @Post('decline')
  @HttpCode(HttpStatus.OK)
  declineConsent(@Query('token') token: string) {
    return this.service.declineByToken(token);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  grantConsent(
    @Query('token') token: string,
    @Body() body: GrantConsentDto,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
    const device = req.headers['user-agent'] ?? 'unknown';
    return this.service.grantConsentByToken(token, body, ip, device);
  }
}
