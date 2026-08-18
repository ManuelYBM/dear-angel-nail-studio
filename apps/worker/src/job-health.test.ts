import assert from 'node:assert/strict';
import test from 'node:test';

import { healthStorageKey, type JobHealthPersistence, JobHealthTracker } from './job-health';
import type { BackgroundJobName } from './jobs';

const job: BackgroundJobName = 'payment-expiry';
const every = 60_000;

void test('persiste el último fallo con marca de tiempo y vencimiento', async () => {
  const persistence = new MemoryPersistence();
  const tracker = new JobHealthTracker(persistence);
  const failedAt = new Date('2026-08-14T12:01:00.000Z');

  await tracker.recordFailure(job, failedAt);

  assert.deepEqual(persistence.writes, [
    {
      key: healthStorageKey('failure', job),
      value: failedAt.toISOString(),
      ttlSeconds: 30 * 24 * 60 * 60,
    },
  ]);
  assert.equal(
    tracker.status(job, every, failedAt.getTime()).lastFailureAt,
    failedAt.toISOString(),
  );
});

void test('hidrata éxito y fallo persistidos tras un reinicio y conserva el fallo posterior', async () => {
  const persistence = new MemoryPersistence();
  const succeededAt = new Date('2026-08-14T12:00:00.000Z');
  const failedAt = new Date('2026-08-14T12:01:00.000Z');
  const firstProcess = new JobHealthTracker(persistence);
  await firstProcess.recordSuccess(job, succeededAt);
  await firstProcess.recordFailure(job, failedAt);

  const restartedProcess = new JobHealthTracker(persistence);
  await restartedProcess.hydrate([job]);

  assert.deepEqual(restartedProcess.status(job, every, failedAt.getTime() + 1_000), {
    fresh: false,
    lastSuccessAt: succeededAt.toISOString(),
    lastFailureAt: failedAt.toISOString(),
  });
});

void test('un éxito posterior recupera la salud y la recuperación también sobrevive otro reinicio', async () => {
  const persistence = new MemoryPersistence();
  const tracker = new JobHealthTracker(persistence);
  const failedAt = new Date('2026-08-14T12:01:00.000Z');
  const recoveredAt = new Date('2026-08-14T12:02:00.000Z');
  await tracker.recordFailure(job, failedAt);
  await tracker.recordSuccess(job, recoveredAt);

  assert.equal(tracker.status(job, every, recoveredAt.getTime() + 1_000).fresh, true);

  const restartedProcess = new JobHealthTracker(persistence);
  await restartedProcess.hydrate([job]);
  assert.deepEqual(restartedProcess.status(job, every, recoveredAt.getTime() + 1_000), {
    fresh: true,
    lastSuccessAt: recoveredAt.toISOString(),
    lastFailureAt: failedAt.toISOString(),
  });
});

class MemoryPersistence implements JobHealthPersistence {
  readonly values = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string; ttlSeconds: number }> = [];

  readMany(keys: readonly string[]): Promise<Array<string | null>> {
    return Promise.resolve(keys.map((key) => this.values.get(key) ?? null));
  }

  write(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
    this.writes.push({ key, value, ttlSeconds });
    return Promise.resolve();
  }
}
