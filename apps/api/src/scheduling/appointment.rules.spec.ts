import { describe, expect, it } from 'vitest';

import { canCloseAppointment } from './appointment.rules';

describe('transiciones temporales de citas', () => {
  const start = new Date('2026-08-14T18:00:00Z');
  const end = new Date('2026-08-14T19:00:00Z');

  it('impide completar una cita antes de que termine', () => {
    expect(canCloseAppointment('CONFIRMED', 'COMPLETED', start, end, start)).toBe(false);
    expect(canCloseAppointment('CONFIRMED', 'COMPLETED', start, end, end)).toBe(true);
  });

  it('impide registrar ausencia antes del inicio', () => {
    expect(
      canCloseAppointment('CONFIRMED', 'NO_SHOW', start, end, new Date('2026-08-14T17:59:59Z')),
    ).toBe(false);
    expect(canCloseAppointment('CONFIRMED', 'NO_SHOW', start, end, start)).toBe(true);
  });

  it('rechaza estados de origen o destino no compatibles', () => {
    expect(canCloseAppointment('HELD', 'COMPLETED', start, end, end)).toBe(false);
    expect(canCloseAppointment('CONFIRMED', 'CANCELLED', start, end, end)).toBe(false);
  });
});
