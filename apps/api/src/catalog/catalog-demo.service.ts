import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PrismaService } from '../infrastructure/prisma.service';
import { StorageService } from '../infrastructure/storage.service';

const demoDesigns = [
  {
    title: 'French rosé dorado',
    description: 'Base rosa translúcida, punta francesa suave y acentos finos de foil dorado.',
    priceCents: 48000,
    durationMinutes: 90,
    technique: 'Soft Gel',
    nailLength: 'Largo 2',
    categories: ['Elegante', 'Francés', 'Dorado'],
    featured: true,
    sortOrder: 10,
    file: 'french-dorado-demo.png',
  },
  {
    title: 'Aurora floral',
    description: 'Efecto aurora en lila con pequeñas flores blancas pintadas a mano.',
    priceCents: 42000,
    durationMinutes: 75,
    technique: 'Gel de Construcción',
    nailLength: 'Corto',
    categories: ['Aurora', 'Flores', 'Lila'],
    featured: true,
    sortOrder: 20,
    file: 'aurora-floral-demo.png',
  },
  {
    title: 'Rubber rosa minimal',
    description: 'Rosa pastel brillante con una línea dorada delicada y detalle de perla.',
    priceCents: 34000,
    durationMinutes: 60,
    technique: 'Esmaltado con Rubber',
    nailLength: 'Corto',
    categories: ['Minimalista', 'Rosa', 'Dorado'],
    featured: false,
    sortOrder: 30,
    file: 'rubber-rosa-demo.png',
  },
] as const;

@Injectable()
export class CatalogDemoService implements OnModuleInit {
  private readonly logger = new Logger(CatalogDemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((await this.prisma.catalogDesign.count()) > 0) return;
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    if (!admin) return;

    for (const design of demoDesigns) {
      const path = resolve(process.cwd(), 'demo-assets', design.file);
      let contents: Buffer;
      try {
        contents = await readFile(path);
      } catch {
        this.logger.warn(`No se encontró el recurso demostrativo ${path}.`);
        return;
      }
      const objectKey = `catalog/demo/${design.file}`;
      await this.storage.putObject(objectKey, contents, 'image/png', { demo: 'true' });
      const data: Prisma.CatalogDesignCreateInput = {
        title: design.title,
        description: design.description,
        priceCents: design.priceCents,
        durationMinutes: design.durationMinutes,
        technique: design.technique,
        nailLength: design.nailLength,
        categories: [...design.categories],
        published: true,
        featured: design.featured,
        sortOrder: design.sortOrder,
        createdBy: { connect: { id: admin.id } },
        images: {
          create: {
            objectKey,
            mimeType: 'image/png',
            filename: design.file,
            sizeBytes: contents.length,
          },
        },
      };
      await this.prisma.catalogDesign.create({ data });
    }
    this.logger.log('Catálogo demostrativo inicializado con 3 diseños reemplazables.');
  }
}
