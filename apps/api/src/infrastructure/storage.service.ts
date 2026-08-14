import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import type { Readable } from 'node:stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = process.env.MINIO_BUCKET ?? 'dear-angel-private';
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'dear_angel',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'dear_angel_minio_password',
  });

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async health(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      throw new Error(`No existe el bucket ${this.bucket}`);
    }
  }

  async putObject(
    objectKey: string,
    contents: Buffer,
    contentType: string,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    await this.client.putObject(this.bucket, objectKey, contents, contents.length, {
      'Content-Type': contentType,
      ...metadata,
    });
  }

  getObject(objectKey: string): Promise<Readable> {
    return this.client.getObject(this.bucket, objectKey);
  }

  async removeObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  private async ensureBucket(): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 15; attempt += 1) {
      try {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) {
          await this.client.makeBucket(this.bucket, 'us-east-1');
        }
        this.logger.log(`Almacenamiento listo: ${this.bucket}`);
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Esperando almacenamiento (${attempt}/15)`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No se pudo iniciar MinIO');
  }
}
