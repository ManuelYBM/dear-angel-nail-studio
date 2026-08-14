import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ChallengePurpose, DeliveryChannel } from '@prisma/client';
import nodemailer from 'nodemailer';

export interface DeliveryReceipt {
  provider: 'mock' | 'whatsapp-cloud' | 'smtp';
  externalId?: string;
  debugCode?: string;
}

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
    const provider = process.env.WHATSAPP_PROVIDER ?? 'mock';
    if (!enabled || provider === 'mock') {
      this.logger.warn(`[mock WhatsApp] ${purpose} para ${this.mask(destination)}: ${code}`);
      return { provider: 'mock', debugCode: code };
    }

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const template =
      purpose === 'VERIFY_PHONE'
        ? process.env.WHATSAPP_TEMPLATE_OTP
        : (process.env.WHATSAPP_TEMPLATE_PASSWORD_RESET ?? process.env.WHATSAPP_TEMPLATE_OTP);
    if (!phoneNumberId || !accessToken || !template) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp todavía no está configurado para enviar códigos.',
      });
    }

    const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v23.0';
    const response = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: destination.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: template,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es_MX' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
      },
    );
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

  private async sendEmail(
    destination: string,
    code: string,
    purpose: ChallengePurpose,
  ): Promise<DeliveryReceipt> {
    const appPassword = process.env.SMTP_APP_PASSWORD;
    const user = process.env.SMTP_USER;
    if (!appPassword || !user || process.env.SMTP_ENABLED === 'false') {
      this.logger.warn(`[mock email] ${purpose} para ${this.maskEmail(destination)}: ${code}`);
      return { provider: 'mock', debugCode: code };
    }

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass: appPassword },
    });
    const result = await transport.sendMail({
      from: `"${process.env.SMTP_FROM_NAME ?? 'Dear Angel Nail Studio'}" <${user}>`,
      to: destination,
      subject: 'Código de seguridad de Dear Angel',
      text: `Tu código de seguridad es ${code}. Caduca en 10 minutos. Si no lo solicitaste, ignora este mensaje.`,
      html: `<p>Tu código de seguridad de Dear Angel es:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Caduca en 10 minutos. Si no lo solicitaste, ignora este mensaje.</p>`,
    });
    return { provider: 'smtp', externalId: result.messageId };
  }

  private async sendWhatsAppTemplate(
    destination: string,
    body: string,
    templateName?: string,
  ): Promise<DeliveryReceipt> {
    const enabled = process.env.WHATSAPP_ENABLED === 'true';
    const provider = process.env.WHATSAPP_PROVIDER ?? 'mock';
    if (!enabled || provider === 'mock') {
      this.logger.log(`[mock WhatsApp] aviso para ${this.mask(destination)}: ${body}`);
      return { provider: 'mock' };
    }
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken || !templateName) {
      throw new ServiceUnavailableException({
        code: 'WHATSAPP_TEMPLATE_NOT_CONFIGURED',
        message: 'La plantilla de WhatsApp para este aviso todavía no está configurada.',
      });
    }
    const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v23.0';
    const response = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: destination.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es_MX' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: body }] }],
          },
        }),
      },
    );
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
    const appPassword = process.env.SMTP_APP_PASSWORD;
    const user = process.env.SMTP_USER;
    if (!appPassword || !user || process.env.SMTP_ENABLED === 'false') {
      this.logger.log(`[mock email] aviso para ${this.maskEmail(destination)}: ${title}`);
      return { provider: 'mock' };
    }
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass: appPassword },
    });
    const result = await transport.sendMail({
      from: `"${process.env.SMTP_FROM_NAME ?? 'Dear Angel Nail Studio'}" <${user}>`,
      to: destination,
      subject: title,
      text: `${body}\n\nConsulta los detalles al entrar a Dear Angel.`,
      html: `<div style="font-family:Arial,sans-serif;color:#49383f"><h2>${this.escapeHtml(title)}</h2><p>${this.escapeHtml(body)}</p><p>Consulta los detalles al entrar a Dear Angel.</p></div>`,
    });
    return { provider: 'smtp', externalId: result.messageId };
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
