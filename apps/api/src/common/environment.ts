const LOCAL_DEVELOPMENT_VALUES = new Set([
  'dear_angel_local_password',
  'dear_angel_minio_password',
  'dear_angel_local_otp_pepper',
  'dear-angel-local-integration-key-change-in-production',
  'replace_with_a_long_random_value',
]);

function requireSecret(name: string, minimumLength: number): void {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength || LOCAL_DEVELOPMENT_VALUES.has(value)) {
    throw new Error(
      `${name} debe configurarse con un secreto propio de al menos ${minimumLength} caracteres.`,
    );
  }
}

function requireDatabasePassword(minimumLength: number): void {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL es obligatorio en producción.');

  let password: string;
  try {
    password = new URL(value).password;
  } catch {
    throw new Error('DATABASE_URL debe ser una URL válida.');
  }
  if (!password || password.length < minimumLength || LOCAL_DEVELOPMENT_VALUES.has(password)) {
    throw new Error(
      `La contraseña de DATABASE_URL debe ser propia y tener al menos ${minimumLength} caracteres.`,
    );
  }
}

function requireHttpsUrl(name: string): void {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio en producción.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} debe ser una URL válida.`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${name} debe usar HTTPS en producción.`);
}

export function validateEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return;

  requireDatabasePassword(16);
  requireSecret('MINIO_SECRET_KEY', 16);
  requireSecret('OTP_PEPPER', 32);
  requireSecret('INTEGRATION_ENCRYPTION_KEY', 32);
  requireHttpsUrl('PUBLIC_APP_URL');

  const origins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!origins.length || origins.some((origin) => origin === '*')) {
    throw new Error('CORS_ORIGIN debe contener orígenes explícitos en producción.');
  }
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.protocol !== 'https:') {
      throw new Error('Todos los valores de CORS_ORIGIN deben usar HTTPS en producción.');
    }
  }

  if (process.env.WHATSAPP_ENABLED === 'true') {
    for (const name of ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN']) {
      if (!process.env[name]?.trim()) throw new Error(`${name} es obligatorio para WhatsApp.`);
    }
  }
  if (process.env.SMTP_ENABLED === 'true') {
    for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_APP_PASSWORD']) {
      if (!process.env[name]?.trim()) throw new Error(`${name} es obligatorio para SMTP.`);
    }
  }
  if (process.env.GOOGLE_CALENDAR_ENABLED === 'true') {
    for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']) {
      if (!process.env[name]?.trim()) {
        throw new Error(`${name} es obligatorio para Google Calendar.`);
      }
    }
  }
}
