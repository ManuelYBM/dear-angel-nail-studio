import { createServer } from 'node:http';

import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import Redis from 'ioredis';

import { JobHealthTracker } from './job-health';
import { internalJobUrl, isBackgroundJobName, JOB_SCHEDULES } from './jobs';

const port = Number(process.env.PORT ?? 3002);
const queueName = 'dear-angel-jobs';
const apiUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
const workerToken =
  process.env.WORKER_SHARED_SECRET ??
  (process.env.NODE_ENV !== 'production'
    ? 'dear-angel-local-worker-secret-change-me'
    : requiredEnvironment('WORKER_SHARED_SECRET'));
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const queueConnection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const queue = new Queue(queueName, { connection: queueConnection });
const jobHealth = new JobHealthTracker({
  readMany: (keys) => queueConnection.mget(...keys),
  write: async (key, value, ttlSeconds) => {
    await queueConnection.set(key, value, 'EX', ttlSeconds);
  },
});

let redisReady = false;
let schedulersReady = false;
let jobHealthHydrated = false;
let schedulerSyncTimer: NodeJS.Timeout | undefined;
let lastRedisErrorLogAt = 0;

connection.on('ready', () => {
  redisReady = true;
  console.log('[worker] Redis conectado');
});
connection.on('close', () => {
  redisReady = false;
});
connection.on('error', (error) => {
  redisReady = false;
  logRedisError(error);
});
queueConnection.on('error', logRedisError);
queueConnection.on('ready', () => void hydrateJobHealth());

const worker = new Worker(queueName, processJob, {
  connection,
  concurrency: 2,
  lockDuration: 180_000,
});

worker.on('failed', (job, error) => {
  if (job && isBackgroundJobName(job.name)) {
    void jobHealth.recordFailure(job.name).catch(reportRedisPersistenceError);
  }
  console.error(`[worker] Falló ${job?.name ?? 'trabajo'}:`, error.message);
});

const server = createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }

  const now = Date.now();
  const jobs = Object.fromEntries(
    JOB_SCHEDULES.map(([name, every]) => [name, jobHealth.status(name, every, now)]),
  );
  const jobsHealthy = Object.values(jobs).every(({ fresh }) => fresh);
  const healthy = redisReady && schedulersReady && jobHealthHydrated && jobsHealthy;
  response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      service: 'dear-angel-worker',
      status: healthy ? 'ok' : 'degraded',
      schedulersReady,
      jobHealthHydrated,
      jobsHealthy,
      jobs,
      timestamp: new Date().toISOString(),
    }),
  );
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[worker] Health check en http://localhost:${port}/health`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] Cerrando por ${signal}`);
  if (schedulerSyncTimer) clearTimeout(schedulerSyncTimer);
  server.close();
  await worker.close();
  await queue.close();
  await queueConnection.quit();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function processJob(job: Job) {
  if (!isBackgroundJobName(job.name)) {
    throw new Error(`Trabajo no reconocido: ${job.name}`);
  }
  console.log(`[worker] Procesando ${job.name} (${job.id ?? 'sin-id'})`);
  const response = await fetch(internalJobUrl(apiUrl, job.name), {
    method: 'POST',
    headers: { 'x-worker-token': workerToken },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`API respondió ${response.status} para ${job.name}: ${detail}`);
  }
  const result = (await response.json()) as unknown;
  await jobHealth.recordSuccess(job.name).catch(reportRedisPersistenceError);
  return result;
}

async function synchronizeSchedulers() {
  try {
    for (const [name, every] of JOB_SCHEDULES) {
      await queue.upsertJobScheduler(
        name,
        { every },
        {
          name,
          data: {},
          opts: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        },
      );
    }
    if (!schedulersReady) {
      console.log(`[worker] ${JOB_SCHEDULES.length} tareas periódicas configuradas`);
    }
    schedulersReady = true;
  } catch (error) {
    schedulersReady = false;
    console.error('[worker] No se pudieron sincronizar tareas:', error);
  } finally {
    schedulerSyncTimer = setTimeout(
      () => void synchronizeSchedulers(),
      schedulersReady ? 5 * 60_000 : 15_000,
    );
  }
}

void synchronizeSchedulers();
void hydrateJobHealth();

async function hydrateJobHealth(): Promise<void> {
  try {
    const names = JOB_SCHEDULES.map(([name]) => name);
    await jobHealth.hydrate(names);
    jobHealthHydrated = true;
  } catch (error) {
    jobHealthHydrated = false;
    if (error instanceof Error) logRedisError(error);
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para iniciar el worker.`);
  return value;
}

function logRedisError(error: Error): void {
  const now = Date.now();
  if (now - lastRedisErrorLogAt < 30_000) return;
  lastRedisErrorLogAt = now;
  console.error('[worker] Redis no disponible:', error.message);
}

function reportRedisPersistenceError(error: unknown): void {
  if (error instanceof Error) logRedisError(error);
}
