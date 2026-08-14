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
});
