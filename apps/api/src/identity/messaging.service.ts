import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ChallengePurpose, DeliveryChannel } from '@prisma/client';
import nodemailer from 'nodemailer';

import { canExposeMockOtpCode, canUseDevelopmentWhatsAppTextOtp } from '../common/environment';

export interface DeliveryReceipt {
  provider: 'mock' | 'whatsapp-cloud' | 'smtp';
  externalId?: string;
  debugCode?: string;
}

const REAL_WHATSAPP_PROVIDERS = new Set(['cloud', 'whatsapp-cloud']);
const DELIVERY_TIMEOUT_MS = 15_000;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  async sendCode(
    channel: DeliveryChannel,
    destination: string,
    code: string,
    purpose: ChallengePurpose,
  ): Promise<DeliveryReceipt> {
    return channel === 'WHATSAPP'
      ? this.sendWhatsApp(destination, code, purpose)
      : this.sendEmail(destination, code, purpose);
  }

  async sendNotification(
    channel: DeliveryChannel,
    destination: string,
    title: string,
    body: string,
    whatsappTemplateName?: string,
  ): Promise<DeliveryReceipt> {
    if (channel === 'WHATSAPP') {
      return this.sendWhatsAppTemplate(destination, body, whatsappTemplateName);
    }
    return this.sendNotificationEmail(destination, title, body);
  }

  private async sendWhatsApp(
    destination: string,
    code: string,
    purpose: ChallengePurpose,
  ): Promise<DeliveryReceipt> {
    const enabled = process.env.WHATSAPP_ENABLED === 'true';
    const provider = (process.env.WHATSAPP_PROVIDER ?? 'mock').trim().toLowerCase();
    if (!enabled || provider === 'mock') {
      return this.mockOtpReceipt('WhatsApp', this.mask(destination), purpose, code);
    }
    if (!REAL_WHATSAPP_PROVIDERS.has(provider)) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_PROVIDER_UNSUPPORTED',
        message: 'El proveedor de WhatsApp no est\u00e1 configurado correctamente.',
      });
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const otpTemplate = process.env.WHATSAPP_TEMPLATE_OTP?.trim();
    const passwordResetTemplate = process.env.WHATSAPP_TEMPLATE_PASSWORD_RESET?.trim();
    const template =
      purpose === 'VERIFY_PHONE' ? otpTemplate : passwordResetTemplate || otpTemplate;
    const useDevelopmentTextOtp = canUseDevelopmentWhatsAppTextOtp(destination);
    if (!phoneNumberId || !accessToken || (!useDevelopmentTextOtp && !template)) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp todavía no está configurado para enviar códigos.',
      });
    }

    const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v26.0';
    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        body: JSON.stringify(
          useDevelopmentTextOtp
            ? {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: destination.replace(/\D/g, ''),
                type: 'text',
                text: {
                  preview_url: false,
                  body: this.developmentOtpMessage(code, purpose),
                },
              }
            : {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: destination.replace(/\D/g, ''),
                type: 'template',
                template: {
                  name: template,
                  language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es_MX' },
                  components: [
                    {
                      type: 'body',
                      parameters: [{ type: 'text', text: code }],
                    },
                    {
                      type: 'button',
                      sub_type: 'url',
                      index: '0',
                      parameters: [{ type: 'text', text: code }],
                    },
                  ],
                },
              },
        ),
      });
    } catch (error) {
      this.logger.error(
        'No se pudo contactar WhatsApp Cloud API.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_DELIVERY_FAILED',
        message: 'No pudimos enviar el código por WhatsApp. Intenta nuevamente.',
      });
    }
    const payload = (await response.json()) as {
      messages?: Array<{ id: string }>;
      error?: unknown;
    };
    if (!response.ok) {
      this.logger.error(`WhatsApp rechazó el mensaje: ${JSON.stringify(payload.error)}`);
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_DELIVERY_FAILED',
        message: 'No pudimos enviar el código por WhatsApp. Intenta nuevamente.',
      });
    }
    return { provider: 'whatsapp-cloud', externalId: payload.messages?.[0]?.id };
  }

  private developmentOtpMessage(code: string, purpose: ChallengePurpose): string {
    const action = purpose === 'VERIFY_PHONE' ? 'verificar tu WhatsApp' : 'recuperar tu acceso';
    return `Dear Angel: tu c\u00f3digo para ${action} es ${code}. Caduca en 10 minutos. No lo compartas.`;
  }

  private async sendEmail(
    destination: string,
    code: string,
    purpose: ChallengePurpose,
  ): Promise<DeliveryReceipt> {
    const appPassword = process.env.SMTP_APP_PASSWORD?.trim();
    const user = process.env.SMTP_USER?.trim();
    if (!appPassword || !user || process.env.SMTP_ENABLED !== 'true') {
      return this.mockOtpReceipt('email', this.maskEmail(destination), purpose, code);
    }

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass: appPassword },
      connectionTimeout: DELIVERY_TIMEOUT_MS,
      greetingTimeout: DELIVERY_TIMEOUT_MS,
      socketTimeout: DELIVERY_TIMEOUT_MS,
    });
    try {
      const result = await transport.sendMail({
        from: `"${process.env.SMTP_FROM_NAME ?? 'Dear Angel Nail Studio'}" <${user}>`,
        to: destination,
        subject: 'Código de seguridad de Dear Angel',
        text: `Tu código de seguridad es ${code}. Caduca en 10 minutos. Si no lo solicitaste, ignora este mensaje.`,
        html: `<p>Tu código de seguridad de Dear Angel es:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Caduca en 10 minutos. Si no lo solicitaste, ignora este mensaje.</p>`,
      });
      return { provider: 'smtp', externalId: result.messageId };
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el correo de seguridad.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_FAILED',
        message: 'No pudimos enviar el correo de seguridad. Intenta nuevamente.',
      });
    }
  }

  private async sendWhatsAppTemplate(
    destination: string,
    body: string,
    templateName?: string,
  ): Promise<DeliveryReceipt> {
    const enabled = process.env.WHATSAPP_ENABLED === 'true';
    const provider = (process.env.WHATSAPP_PROVIDER ?? 'mock').trim().toLowerCase();
    if (!enabled || provider === 'mock') {
      this.assertMockNotificationAllowed('WhatsApp');
      this.logger.log(`[mock WhatsApp] aviso para ${this.mask(destination)}`);
      return { provider: 'mock' };
    }
    if (!REAL_WHATSAPP_PROVIDERS.has(provider)) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_PROVIDER_UNSUPPORTED',
        message: 'El proveedor de WhatsApp no est\u00e1 configurado correctamente.',
      });
    }
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const normalizedTemplateName = templateName?.trim();
    if (!phoneNumberId || !accessToken || !normalizedTemplateName) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_TEMPLATE_NOT_CONFIGURED',
        message: 'La plantilla de WhatsApp para este aviso todavía no está configurada.',
      });
    }
    const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v26.0';
    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: destination.replace(/\D/g, ''),
          type: 'template',
          template: {
            name: normalizedTemplateName,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es_MX' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }],
          },
        }),
      });
    } catch (error) {
      this.logger.error(
        'No se pudo contactar WhatsApp Cloud API para enviar el aviso.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('WhatsApp no pudo entregar el aviso.');
    }
    const payload = (await response.json()) as {
      messages?: Array<{ id: string }>;
      error?: unknown;
    };
    if (!response.ok) {
      this.logger.error(`WhatsApp rechazó el aviso: ${JSON.stringify(payload.error)}`);
      throw new ServiceUnavailableException('WhatsApp no pudo entregar el aviso.');
    }
    return { provider: 'whatsapp-cloud', externalId: payload.messages?.[0]?.id };
  }

  private async sendNotificationEmail(
    destination: string,
    title: string,
    body: string,
  ): Promise<DeliveryReceipt> {
    const appPassword = process.env.SMTP_APP_PASSWORD?.trim();
    const user = process.env.SMTP_USER?.trim();
    if (!appPassword || !user || process.env.SMTP_ENABLED !== 'true') {
      this.assertMockNotificationAllowed('email');
      this.logger.log(`[mock email] aviso para ${this.maskEmail(destination)}`);
      return { provider: 'mock' };
    }
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass: appPassword },
      connectionTimeout: DELIVERY_TIMEOUT_MS,
      greetingTimeout: DELIVERY_TIMEOUT_MS,
      socketTimeout: DELIVERY_TIMEOUT_MS,
    });
    try {
      const result = await transport.sendMail({
        from: `"${process.env.SMTP_FROM_NAME ?? 'Dear Angel Nail Studio'}" <${user}>`,
        to: destination,
        subject: title,
        text: `${body}\n\nConsulta los detalles al entrar a Dear Angel.`,
        html: `<div style="font-family:Arial,sans-serif;color:#49383f"><h2>${this.escapeHtml(title)}</h2><p>${this.escapeHtml(body)}</p><p>Consulta los detalles al entrar a Dear Angel.</p></div>`,
      });
      return { provider: 'smtp', externalId: result.messageId };
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el aviso por correo.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('El correo no pudo entregar el aviso.');
    }
  }

  private mockOtpReceipt(
    channel: string,
    destination: string,
    purpose: ChallengePurpose,
    code: string,
  ): DeliveryReceipt {
    if (!canExposeMockOtpCode()) {
      throw new ServiceUnavailableException({
        code: 'OTP_DELIVERY_NOT_CONFIGURED',
        message: 'El canal para enviar el c\u00f3digo no est\u00e1 configurado.',
      });
    }
    this.logger.warn(
      `[mock ${channel}] ${purpose} para ${destination}; c\u00f3digo disponible solo en la respuesta de desarrollo.`,
    );
    return { provider: 'mock', debugCode: code };
  }

  private assertMockNotificationAllowed(channel: string): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException({
        code: 'NOTIFICATION_DELIVERY_NOT_CONFIGURED',
        message: `El canal de ${channel} no est\u00e1 configurado.`,
      });
    }
  }

  private escapeHtml(value: string) {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        })[character] as string,
    );
  }

  private mask(value: string): string {
    return `${value.slice(0, 3)}••••${value.slice(-4)}`;
  }

  private maskEmail(value: string): string {
    const [name = '', domain = ''] = value.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
}
