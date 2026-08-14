import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../common/auth.decorators';
import { PrismaService } from '../infrastructure/prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { StorageService } from '../infrastructure/storage.service';

interface HealthResponse {
  service: string;
  status: 'ok' | 'degraded';
  timestamp: string;
  dependencies?: Record<string, 'ok' | 'error'>;
}

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  @Get('live')
  live(): HealthResponse {
    return {
      service: 'dear-angel-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(): Promise<HealthResponse> {
    const checks = await Promise.allSettled([
      this.prisma.health(),
      this.redis.health(),
      this.storage.health(),
    ]);
    const dependencies = {
      postgres: checks[0]?.status === 'fulfilled' ? 'ok' : 'error',
      redis: checks[1]?.status === 'fulfilled' ? 'ok' : 'error',
      storage: checks[2]?.status === 'fulfilled' ? 'ok' : 'error',
    } as const;

    if (Object.values(dependencies).some((status) => status === 'error')) {
      throw new ServiceUnavailableException({
        service: 'dear-angel-api',
        status: 'degraded',
        timestamp: new Date().toISOString(),
        dependencies,
      });
    }

    return {
      service: 'dear-angel-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }
}
