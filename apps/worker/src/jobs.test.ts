import assert from 'node:assert/strict';
import test from 'node:test';

import { internalJobUrl, isBackgroundJobName, JOB_SCHEDULES } from './jobs';

void test('solo reconoce los trabajos de mantenimiento declarados', () => {
  assert.equal(isBackgroundJobName('notification-deliveries'), true);
  assert.equal(isBackgroundJobName('appointment-reminders'), true);
  assert.equal(isBackgroundJobName('pending-registration-cleanup'), true);
  assert.equal(isBackgroundJobName('anything-else'), false);
  assert.equal(new Set(JOB_SCHEDULES.map(([name]) => name)).size, JOB_SCHEDULES.length);
});

void test('construye una URL interna estable sin barras duplicadas', () => {
  assert.equal(
    internalJobUrl('http://api:3001/api/', 'payment-expiry'),
    'http://api:3001/api/internal/jobs/payment-expiry',
  );
});

void test('todos los intervalos son positivos y el más frecuente no baja de 30 segundos', () => {
  assert.equal(
    JOB_SCHEDULES.every(([, every]) => every >= 30_000),
    true,
  );
});
