import { afterEach, describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('validateEnvironment', () => {
  it('permite el entorno local', () => {
    process.env.NODE_ENV = 'development';
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('rechaza secretos locales en producción', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://dear_angel:dear_angel_local_password@postgres:5432/dear_angel';
    expect(() => validateEnvironment()).toThrow(/DATABASE_URL/);
  });

  it('acepta una configuración de producción endurecida', () => {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      BACKGROUND_JOBS_MODE: 'api',
      DATABASE_URL: 'postgresql://dear_angel:postgres-secret-unique-2026@postgres:5432/dear_angel',
      MINIO_SECRET_KEY: 'minio-secret-unique-2026',
      OTP_PEPPER: 'otp-pepper-with-at-least-thirty-two-characters',
      INTEGRATION_ENCRYPTION_KEY: 'calendar-key-with-at-least-thirty-two-characters',
      PUBLIC_APP_URL: 'https://dearangel.example',
      CORS_ORIGIN: 'https://dearangel.example',
      WHATSAPP_ENABLED: 'false',
      SMTP_ENABLED: 'false',
      GOOGLE_CALENDAR_ENABLED: 'false',
    };
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('rechaza exponer códigos mock en producción', () => {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      BACKGROUND_JOBS_MODE: 'api',
      DATABASE_URL: 'postgresql://dear_angel:postgres-secret-unique-2026@postgres:5432/dear_angel',
      MINIO_SECRET_KEY: 'minio-secret-unique-2026',
      OTP_PEPPER: 'otp-pepper-with-at-least-thirty-two-characters',
      OTP_MOCK_DEBUG_ENABLED: 'true',
      INTEGRATION_ENCRYPTION_KEY: 'calendar-key-with-at-least-thirty-two-characters',
      PUBLIC_APP_URL: 'https://dearangel.example',
      CORS_ORIGIN: 'https://dearangel.example',
      WHATSAPP_ENABLED: 'false',
      SMTP_ENABLED: 'false',
      GOOGLE_CALENDAR_ENABLED: 'false',
    };
    expect(() => validateEnvironment()).toThrow(/OTP_MOCK_DEBUG_ENABLED/);
  });

  it('rechaza destinatarios de OTP por texto libre en produccion', () => {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      BACKGROUND_JOBS_MODE: 'api',
      DATABASE_URL: 'postgresql://dear_angel:postgres-secret-unique-2026@postgres:5432/dear_angel',
      MINIO_SECRET_KEY: 'minio-secret-unique-2026',
      OTP_PEPPER: 'otp-pepper-with-at-least-thirty-two-characters',
      INTEGRATION_ENCRYPTION_KEY: 'calendar-key-with-at-least-thirty-two-characters',
      PUBLIC_APP_URL: 'https://dearangel.example',
      CORS_ORIGIN: 'https://dearangel.example',
      WHATSAPP_DEVELOPMENT_TEXT_OTP_RECIPIENTS: '+529991234567',
      WHATSAPP_ENABLED: 'false',
      SMTP_ENABLED: 'false',
      GOOGLE_CALENDAR_ENABLED: 'false',
    };
    expect(() => validateEnvironment()).toThrow(/WHATSAPP_DEVELOPMENT_TEXT_OTP_RECIPIENTS/);
  });

  it('rechaza WhatsApp mock cuando el canal se habilita en producción', () => {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      BACKGROUND_JOBS_MODE: 'api',
      DATABASE_URL: 'postgresql://dear_angel:postgres-secret-unique-2026@postgres:5432/dear_angel',
      MINIO_SECRET_KEY: 'minio-secret-unique-2026',
      OTP_PEPPER: 'otp-pepper-with-at-least-thirty-two-characters',
      INTEGRATION_ENCRYPTION_KEY: 'calendar-key-with-at-least-thirty-two-characters',
      PUBLIC_APP_URL: 'https://dearangel.example',
      CORS_ORIGIN: 'https://dearangel.example',
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_PROVIDER: 'mock',
      WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
      WHATSAPP_ACCESS_TOKEN: 'access-token',
      WHATSAPP_TEMPLATE_OTP: 'otp-template',
      SMTP_ENABLED: 'false',
      GOOGLE_CALENDAR_ENABLED: 'false',
    };
    expect(() => validateEnvironment()).toThrow(/WHATSAPP_PROVIDER/);
  });

  it('exige callback HTTPS cuando Google Calendar se habilita en producción', () => {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      BACKGROUND_JOBS_MODE: 'api',
      DATABASE_URL: 'postgresql://dear_angel:postgres-secret-unique-2026@postgres:5432/dear_angel',
      MINIO_SECRET_KEY: 'minio-secret-unique-2026',
      OTP_PEPPER: 'otp-pepper-with-at-least-thirty-two-characters',
      INTEGRATION_ENCRYPTION_KEY: 'calendar-key-with-at-least-thirty-two-characters',
      PUBLIC_APP_URL: 'https://dearangel.example',
      CORS_ORIGIN: 'https://dearangel.example',
      WHATSAPP_ENABLED: 'false',
      SMTP_ENABLED: 'false',
      GOOGLE_CALENDAR_ENABLED: 'true',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:3001/api/integrations/google-calendar/callback',
    };
    expect(() => validateEnvironment()).toThrow(/GOOGLE_REDIRECT_URI/);
  });
});
