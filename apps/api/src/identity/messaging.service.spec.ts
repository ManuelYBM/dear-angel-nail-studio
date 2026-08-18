import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';

import { MessagingService } from './messaging.service';

const original = { ...process.env };

describe('MessagingService OTP mock', () => {
  beforeEach(() => {
    process.env = {
      ...original,
      NODE_ENV: 'development',
      OTP_MOCK_DEBUG_ENABLED: 'true',
      WHATSAPP_ENABLED: 'false',
      WHATSAPP_PROVIDER: 'mock',
      WHATSAPP_DEVELOPMENT_TEXT_OTP_RECIPIENTS: '',
      SMTP_ENABLED: 'false',
    };
  });

  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('solo devuelve el código con opt-in explícito de desarrollo y no lo registra', async () => {
    const service = new MessagingService();
    const logger = (service as unknown as { logger: { warn: (message: string) => void } }).logger;
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    await expect(
      service.sendCode('WHATSAPP', '+529991234567', '123456', 'VERIFY_PHONE'),
    ).resolves.toEqual({ provider: 'mock', debugCode: '123456' });
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls.flat().join(' ')).not.toContain('123456');
  });

  it('falla cerrado si falta el opt-in', async () => {
    process.env.OTP_MOCK_DEBUG_ENABLED = 'false';
    const service = new MessagingService();

    await expect(
      service.sendCode('WHATSAPP', '+529991234567', '123456', 'VERIFY_PHONE'),
    ).rejects.toThrow();
    await expect(
      service.sendCode('EMAIL', 'admin@example.com', '123456', 'RESET_PASSWORD'),
    ).rejects.toThrow();
  });

  it('nunca habilita el código mock en producción aunque la variable esté activa', async () => {
    process.env.NODE_ENV = 'production';
    const service = new MessagingService();

    await expect(
      service.sendCode('WHATSAPP', '+529991234567', '123456', 'VERIFY_PHONE'),
    ).rejects.toThrow();
    await expect(
      service.sendNotification('EMAIL', 'admin@example.com', 'Aviso', 'Detalle'),
    ).rejects.toThrow();
  });

  it('envía el OTP real con una plantilla de autenticación y botón para copiar el código', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'cloud';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_TEMPLATE_OTP = 'dear_angel_verification';
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'es_MX';
    delete process.env.WHATSAPP_GRAPH_API_VERSION;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new MessagingService();

    await expect(
      service.sendCode('WHATSAPP', '+529991234567', '123456', 'VERIFY_PHONE'),
    ).resolves.toEqual({ provider: 'whatsapp-cloud', externalId: 'wamid.test' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v26.0/123456789/messages');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer meta-token' });
    expect(parseRequestBody(init)).toMatchObject({
      messaging_product: 'whatsapp',
      to: '529991234567',
      type: 'template',
      template: {
        name: 'dear_angel_verification',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: '123456' }],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: '123456' }],
          },
        ],
      },
    });
  });

  it('reutiliza la plantilla OTP para recuperación si la plantilla específica está vacía', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'cloud';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_TEMPLATE_OTP = 'dear_angel_verification';
    process.env.WHATSAPP_TEMPLATE_PASSWORD_RESET = '';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.reset' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new MessagingService();

    await service.sendCode('WHATSAPP', '+529991234567', '654321', 'RESET_PASSWORD');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = parseRequestBody(init) as {
      template: { name: string };
    };
    expect(payload.template.name).toBe('dear_angel_verification');
  });

  it('configura SMTP real con límites de espera y devuelve el identificador del proveedor', async () => {
    process.env.SMTP_ENABLED = 'true';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_APP_PASSWORD = 'app-password';
    process.env.SMTP_FROM_NAME = 'Dear Angel';
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'smtp-message-id' });
    const createTransport = vi
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as never);
    const service = new MessagingService();

    await expect(
      service.sendCode('EMAIL', 'staff@example.com', '123456', 'RESET_PASSWORD'),
    ).resolves.toEqual({ provider: 'smtp', externalId: 'smtp-message-id' });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: 'sender@example.com', pass: 'app-password' },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 15_000,
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Dear Angel" <sender@example.com>',
        to: 'staff@example.com',
        subject: 'Código de seguridad de Dear Angel',
      }),
    );
  });

  it('falla de forma controlada cuando Meta rechaza el mensaje', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'cloud';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_TEMPLATE_OTP = 'dear_angel_verification';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'template rejected' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const service = new MessagingService();
    vi.spyOn(
      (service as unknown as { logger: { error: (message: string) => void } }).logger,
      'error',
    ).mockImplementation(() => undefined);

    await expect(
      service.sendCode('WHATSAPP', '+529991234567', '123456', 'VERIFY_PHONE'),
    ).rejects.toThrow();
  });

  it('envia el OTP como texto solo a un destinatario permitido en desarrollo', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'cloud';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_TEMPLATE_OTP = '';
    process.env.WHATSAPP_DEVELOPMENT_TEXT_OTP_RECIPIENTS = '+529991234567';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.development' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new MessagingService();

    await expect(
      service.sendCode('WHATSAPP', '+52 999 123 4567', '123456', 'VERIFY_PHONE'),
    ).resolves.toEqual({ provider: 'whatsapp-cloud', externalId: 'wamid.development' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(parseRequestBody(init)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '529991234567',
      type: 'text',
      text: {
        preview_url: false,
        body: 'Dear Angel: tu c\u00f3digo para verificar tu WhatsApp es 123456. Caduca en 10 minutos. No lo compartas.',
      },
    });
  });

  it('rechaza texto libre para un destinatario fuera de la lista de desarrollo', async () => {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'cloud';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_TEMPLATE_OTP = '';
    process.env.WHATSAPP_DEVELOPMENT_TEXT_OTP_RECIPIENTS = '+529991234567';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new MessagingService();

    await expect(
      service.sendCode('WHATSAPP', '+529998765432', '123456', 'VERIFY_PHONE'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function parseRequestBody(init: RequestInit): unknown {
  if (typeof init.body !== 'string') throw new TypeError('Se esperaba un cuerpo JSON de texto.');
  return JSON.parse(init.body) as unknown;
}
