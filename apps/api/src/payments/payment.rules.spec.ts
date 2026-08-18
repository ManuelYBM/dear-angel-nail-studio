import { describe, expect, it } from 'vitest';

import {
  canReviewDeposit,
  canUploadReceipt,
  confirmationCode,
  paymentReviewActionUrl,
} from './payment.rules';

describe('reglas de anticipos', () => {
  it('permite subir comprobante solamente durante un apartado vigente', () => {
    const now = new Date('2026-08-12T18:00:00Z');
    expect(canUploadReceipt('HELD', new Date('2026-08-12T18:01:00Z'), now)).toBe(true);
    expect(canUploadReceipt('HELD', new Date('2026-08-12T17:59:00Z'), now)).toBe(false);
    expect(canUploadReceipt('PENDING_PAYMENT', new Date('2026-08-12T18:01:00Z'), now)).toBe(false);
  });

  it('solo permite revisar un comprobante que conserva el horario', () => {
    expect(canReviewDeposit('PENDING_REVIEW', 'PENDING_PAYMENT')).toBe(true);
    expect(canReviewDeposit('AWAITING_RECEIPT', 'HELD')).toBe(false);
    expect(canReviewDeposit('PENDING_REVIEW', 'CANCELLED')).toBe(false);
  });

  it('deriva un folio digital estable de la referencia SPEI', () => {
    expect(confirmationCode('DA-260812-ABC123')).toBe('RES-260812-ABC123');
  });

  it('dirige un rechazo al anticipo exacto', () => {
    expect(paymentReviewActionUrl('REJECTED', 'appointment-id')).toBe(
      '/anticipo?appointmentId=appointment-id',
    );
    expect(paymentReviewActionUrl('APPROVED', 'appointment-id')).toBe('/agenda');
  });
});
