import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PublicCatalogQueryDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

describe('preview p\u00fablica del cat\u00e1logo', () => {
  it('convierte y acepta un l\u00edmite de 1 a 6', async () => {
    const query = plainToInstance(PublicCatalogQueryDto, { limit: '4' });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.limit).toBe(4);
  });

  it.each(['0', '7', '2.5', 'no-es-un-n\u00famero'])('rechaza limit=%s', async (limit) => {
    const query = plainToInstance(PublicCatalogQueryDto, { limit });

    await expect(validate(query)).resolves.not.toHaveLength(0);
  });

  it('limita la consulta sin alterar la prioridad del cat\u00e1logo', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new CatalogService(
      { catalogDesign: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listDesigns(undefined, { limit: 4 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { published: true },
        take: 4,
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('conserva el listado completo cuando no se solicita preview', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new CatalogService(
      { catalogDesign: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listDesigns(undefined, {});

    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty('take');
  });
});
