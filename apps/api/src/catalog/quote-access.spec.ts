import { describe, expect, it } from 'vitest';

import { canTechnicianAccessQuote } from './quote-access';

describe('privacidad de cotizaciones', () => {
  it('permite consultar una solicitud abierta para cualquiera', () => {
    expect(
      canTechnicianAccessQuote('tech-b', {
        status: 'PENDING_REVIEW',
        assignedTechnicianId: null,
        preferredTechnicianId: null,
      }),
    ).toBe(true);
  });

  it('después del reclamo solo permite a la responsable', () => {
    const quote = {
      status: 'IN_REVIEW',
      assignedTechnicianId: 'tech-a',
      preferredTechnicianId: null,
    };
    expect(canTechnicianAccessQuote('tech-a', quote)).toBe(true);
    expect(canTechnicianAccessQuote('tech-b', quote)).toBe(false);
  });

  it('no expone solicitudes canceladas que nunca fueron asignadas', () => {
    expect(
      canTechnicianAccessQuote('tech-b', {
        status: 'CANCELLED',
        assignedTechnicianId: null,
        preferredTechnicianId: null,
      }),
    ).toBe(false);
  });
});
