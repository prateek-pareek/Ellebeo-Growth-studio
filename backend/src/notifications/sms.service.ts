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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    if (accountSid && apiKey && apiSecret) {
      this.client = twilio(apiKey, apiSecret, { accountSid });
      this.logger.log('Twilio initialized with API Key');
    } else if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
      this.logger.log('Twilio initialized with Auth Token');
    } else {
      this.logger.warn('Twilio not configured — SMS disabled');
    }
  }

  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (raw.trimStart().startsWith('+')) return `+${digits}`;
    if (digits.startsWith('61') && digits.length === 11) return `+${digits}`; // AU with country code
    if (digits.startsWith('0') && digits.length === 10) return `+61${digits.slice(1)}`; // AU local 04XXXXXXXX
    if (digits.length === 10) return `+1${digits}`;  // assume US
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return raw;
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.client) return;
    const from = this.config.get<string>('TWILIO_PHONE_NUMBER')
               ?? this.config.get<string>('TWILIO_FROM_NUMBER');
    const messagingServiceSid = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID');
    const normalized = this.normalizePhone(to);

    try {
      await this.client.messages.create({
        body,
        to: normalized,
        ...(from ? { from } : {}),
        ...(messagingServiceSid ? { messagingServiceSid } : {}),
      });
      this.logger.log(`SMS sent to ${normalized} (raw: ${to})`);
    } catch (err: any) {
      this.logger.error(`SMS failed to ${normalized} (raw: ${to}): ${err.message}`);
    }
  }
}
