import { afterEach, describe, expect, it } from 'vitest';

import { IntegrationStatusController } from './calendar.controller';

const original = { ...process.env };

describe('IntegrationStatusController', () => {
  afterEach(() => {
    process.env = { ...original };
  });

  it('no presenta como demostración un canal que realmente está cerrado', () => {
    process.env.NODE_ENV = 'development';
    process.env.OTP_MOCK_DEBUG_ENABLED = 'false';
    process.env.WHATSAPP_ENABLED = 'false';
    process.env.SMTP_ENABLED = 'false';

    const result = new IntegrationStatusController().status();

    expect(result.whatsapp.mode).toBe('unavailable');
    expect(result.email.mode).toBe('unavailable');
  });

  it('distingue la simulación local habilitada de los proveedores reales', () => {
    process.env.NODE_ENV = 'development';
    process.env.OTP_MOCK_DEBUG_ENABLED = 'true';
    process.env.WHATSAPP_ENABLED = 'false';
    process.env.SMTP_ENABLED = 'false';

    const result = new IntegrationStatusController().status();

    expect(result.whatsapp.mode).toBe('development');
    expect(result.email.mode).toBe('development');
  });

  it('no anuncia WhatsApp real si el proveedor sigue en mock', () => {
    process.env.NODE_ENV = 'development';
    process.env.OTP_MOCK_DEBUG_ENABLED = 'false';
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'mock';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_TEMPLATE_OTP = 'otp';

    const result = new IntegrationStatusController().status();

    expect(result.whatsapp.mode).toBe('unavailable');
    expect(result.whatsapp.configured).toBe(false);
  });

  it('distingue la entrega real de prueba del proveedor de produccion', () => {
    process.env.NODE_ENV = 'development';
    process.env.OTP_MOCK_DEBUG_ENABLED = 'false';
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'cloud';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_TEMPLATE_OTP = '';
    process.env.WHATSAPP_DEVELOPMENT_TEXT_OTP_RECIPIENTS = '+529991234567';

    const result = new IntegrationStatusController().status();

    expect(result.whatsapp.mode).toBe('testing');
    expect(result.whatsapp.configured).toBe(true);
  });
});
