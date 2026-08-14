import { Controller, Delete, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser, Public, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import { CalendarService } from './calendar.service';

@Controller('integrations/google-calendar')
export class CalendarController {
  constructor(private readonly calendars: CalendarService) {}

  @Roles('NAIL_TECHNICIAN')
  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.calendars.status(user.id);
  }

  @Roles('NAIL_TECHNICIAN')
  @Get('connect')
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.calendars.authorizationUrl(user.id);
  }

  @Roles('NAIL_TECHNICIAN')
  @Delete()
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.calendars.disconnect(user.id);
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() response: Response,
  ) {
    const appUrl = process.env.PUBLIC_APP_URL ?? 'http://localhost:3000';
    if (error) return response.redirect(`${appUrl}/integraciones?google=denied`);
    try {
      await this.calendars.completeAuthorization(code, state);
      return response.redirect(`${appUrl}/integraciones?google=connected`);
    } catch {
      return response.redirect(`${appUrl}/integraciones?google=error`);
    }
  }
}

@Controller('integrations')
export class IntegrationStatusController {
  @Get('status')
  status() {
    const whatsappEnabled = process.env.WHATSAPP_ENABLED === 'true';
    const whatsappConfigured = Boolean(
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_TEMPLATE_OTP,
    );
    const smtpConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
    const googleConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.INTEGRATION_ENCRYPTION_KEY,
    );
    return {
      whatsapp: {
        mode: whatsappEnabled && whatsappConfigured ? 'real' : 'mock',
        configured: whatsappConfigured,
      },
      email: {
        mode: process.env.SMTP_ENABLED === 'true' && smtpConfigured ? 'real' : 'mock',
        configured: smtpConfigured,
      },
      googleCalendar: {
        enabled: process.env.GOOGLE_CALENDAR_ENABLED === 'true',
        configured: googleConfigured,
      },
    };
  }
}
