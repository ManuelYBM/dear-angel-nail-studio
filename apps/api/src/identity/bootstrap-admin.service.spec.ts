import { describe, expect, it } from 'vitest';

import { assertValidInitialAdminPassword } from './bootstrap-admin.service';

describe('contraseña inicial de administración', () => {
  it('aplica la misma política mínima que la API', () => {
    expect(() => assertValidInitialAdminPassword('CartaSegura2026', true)).not.toThrow();
    expect(() => assertValidInitialAdminPassword('solo-letras', true)).toThrow();
    expect(() => assertValidInitialAdminPassword('12345678', true)).toThrow();
    expect(() => assertValidInitialAdminPassword('Aa1', true)).toThrow();
  });

  it('rechaza la clave de demostración en producción', () => {
    expect(() => assertValidInitialAdminPassword('DearAngelDemo2026', true)).toThrow();
    expect(() => assertValidInitialAdminPassword('DearAngelDemo2026', false)).not.toThrow();
  });
});
