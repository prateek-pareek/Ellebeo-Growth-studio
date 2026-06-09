import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private client: any = null;

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken  = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const apiKey     = this.config.get<string>('TWILIO_API_KEY');
    const apiSecret  = this.config.get<string>('TWILIO_API_SECRET');

    if (accountSid && apiKey && apiSecret) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      this.client = twilio(apiKey, apiSecret, { accountSid });
      this.logger.log('Twilio initialized with API Key');
    } else if (accountSid && authToken) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      this.client = twilio(accountSid, authToken);
      this.logger.log('Twilio initialized with Auth Token');
    } else {
      this.logger.warn('Twilio not configured — SMS disabled');
    }
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.client) return;
    const from = this.config.get<string>('TWILIO_PHONE_NUMBER')
               ?? this.config.get<string>('TWILIO_FROM_NUMBER');
    const messagingServiceSid = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID');

    try {
      await this.client.messages.create({
        body,
        to,
        ...(from ? { from } : {}),
        ...(messagingServiceSid ? { messagingServiceSid } : {}),
      });
      this.logger.log(`SMS sent to ${to}`);
    } catch (err: any) {
      this.logger.error(`SMS failed to ${to}: ${err.message}`);
    }
  }
}
