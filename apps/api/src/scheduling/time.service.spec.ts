import { describe, expect, it } from 'vitest';

import { TimeService } from './time.service';

describe('TimeService', () => {
  const service = new TimeService();

  it('convierte una fecha de Mérida sin desplazar el día', () => {
    const start = service.dateAndMinute('2026-08-12', 8 * 60);

    expect(service.dateKey(start)).toBe('2026-08-12');
    expect(service.minuteOfDay(start)).toBe(480);
  });

  it('permite representar medianoche como el minuto 1440 del día anterior', () => {
    const end = service.dateAndMinute('2026-08-12', 1440);

    expect(service.dateKey(end)).toBe('2026-08-13');
    expect(service.minuteOfDay(end)).toBe(0);
  });

  it('usa lunes como día uno', () => {
    expect(service.dayOfWeek('2026-08-10')).toBe(1);
    expect(service.dayOfWeek('2026-08-16')).toBe(7);
  });
});
