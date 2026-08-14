import { createServer } from 'node:http';

import { Worker } from 'bullmq';
import Redis from 'ioredis';

const port = Number(process.env.PORT ?? 3002);
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

let redisReady = false;

connection.on('ready', () => {
  redisReady = true;
  console.log('[worker] Redis conectado');
});
connection.on('close', () => {
  redisReady = false;
});
connection.on('error', (error) => {
  redisReady = false;
  console.error('[worker] Redis:', error.message);
});

const worker = new Worker(
  'dear-angel-jobs',
  (job) => {
    console.log(`[worker] Procesando ${job.name} (${job.id ?? 'sin-id'})`);
    return Promise.resolve();
  },
  { connection },
);

worker.on('failed', (job, error) => {
  console.error(`[worker] Falló ${job?.name ?? 'trabajo'}:`, error.message);
});

const server = createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(redisReady ? 200 : 503, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      service: 'dear-angel-worker',
      status: redisReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    }),
  );
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[worker] Health check en http://localhost:${port}/health`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] Cerrando por ${signal}`);
  server.close();
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
