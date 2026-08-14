import { describe, expect, it } from 'vitest';

import { canRedeemOnAppointment, eligibleMilestones, totalVisits } from './loyalty.rules';

describe('reglas de fidelidad', () => {
  it('suma visitas y correcciones como movimientos', () => {
    expect(totalVisits([{ delta: 1 }, { delta: 1 }, { delta: -1 }, { delta: 3 }])).toBe(4);
  });

  it('solo desbloquea hitos activos alcanzados', () => {
    expect(
      eligibleMilestones(5, [
        { id: 'second', visitNumber: 2, active: true },
        { id: 'fifth', visitNumber: 5, active: true },
        { id: 'hidden', visitNumber: 3, active: false },
        { id: 'tenth', visitNumber: 10, active: true },
      ]),
    ).toEqual(['second', 'fifth']);
  });

  it('permite canje solo en cita confirmada o atendida', () => {
    expect(canRedeemOnAppointment('CONFIRMED')).toBe(true);
    expect(canRedeemOnAppointment('COMPLETED')).toBe(true);
    expect(canRedeemOnAppointment('NO_SHOW')).toBe(false);
    expect(canRedeemOnAppointment('CANCELLED')).toBe(false);
  });
});
