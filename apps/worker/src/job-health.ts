import type { BackgroundJobName } from './jobs';

const HEALTH_TTL_SECONDS = 30 * 24 * 60 * 60;
const SUCCESS_KEY_PREFIX = 'dear-angel-worker:last-success';
const FAILURE_KEY_PREFIX = 'dear-angel-worker:last-failure';

type HealthEvent = 'success' | 'failure';

export interface JobHealthPersistence {
  readMany(keys: readonly string[]): Promise<Array<string | null>>;
  write(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface JobHealthStatus {
  fresh: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export class JobHealthTracker {
  private readonly lastSuccessAt = new Map<BackgroundJobName, Date>();
  private readonly lastFailureAt = new Map<BackgroundJobName, Date>();

  constructor(private readonly persistence: JobHealthPersistence) {}

  async recordSuccess(name: BackgroundJobName, occurredAt = new Date()): Promise<void> {
    setLatest(this.lastSuccessAt, name, occurredAt);
    await this.persist('success', name, occurredAt);
  }

  async recordFailure(name: BackgroundJobName, occurredAt = new Date()): Promise<void> {
    setLatest(this.lastFailureAt, name, occurredAt);
    await this.persist('failure', name, occurredAt);
  }

  async hydrate(names: readonly BackgroundJobName[]): Promise<void> {
    const keys = [
      ...names.map((name) => healthStorageKey('success', name)),
      ...names.map((name) => healthStorageKey('failure', name)),
    ];
    const values = await this.persistence.readMany(keys);

    names.forEach((name, index) => {
      hydrateTimestamp(this.lastSuccessAt, name, values[index]);
      hydrateTimestamp(this.lastFailureAt, name, values[index + names.length]);
    });
  }

  status(name: BackgroundJobName, every: number, now = Date.now()): JobHealthStatus {
    const lastSuccessAt = this.lastSuccessAt.get(name);
    const lastFailureAt = this.lastFailureAt.get(name);
    const freshnessWindow = Math.max(15 * 60_000, every * 3);

    return {
      fresh: Boolean(
        lastSuccessAt &&
        now - lastSuccessAt.getTime() <= freshnessWindow &&
        (!lastFailureAt || lastSuccessAt > lastFailureAt),
      ),
      lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: lastFailureAt?.toISOString() ?? null,
    };
  }

  private async persist(
    event: HealthEvent,
    name: BackgroundJobName,
    occurredAt: Date,
  ): Promise<void> {
    await this.persistence.write(
      healthStorageKey(event, name),
      occurredAt.toISOString(),
      HEALTH_TTL_SECONDS,
    );
  }
}

export function healthStorageKey(event: HealthEvent, name: BackgroundJobName): string {
  const prefix = event === 'success' ? SUCCESS_KEY_PREFIX : FAILURE_KEY_PREFIX;
  return `${prefix}:${name}`;
}

function hydrateTimestamp(
  destination: Map<BackgroundJobName, Date>,
  name: BackgroundJobName,
  value: string | null | undefined,
): void {
  if (!value) return;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) setLatest(destination, name, parsed);
}

function setLatest(
  destination: Map<BackgroundJobName, Date>,
  name: BackgroundJobName,
  occurredAt: Date,
): void {
  const current = destination.get(name);
  if (!current || occurredAt > current) destination.set(name, occurredAt);
}
