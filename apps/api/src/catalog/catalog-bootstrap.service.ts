import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { CalculatorOptionKind, CalculatorPricingMode, Prisma } from '@prisma/client';

import { PrismaService } from '../infrastructure/prisma.service';

interface SeedOption {
  kind: CalculatorOptionKind;
  code: string;
  name: string;
  iconText: string;
  priceCents: number;
  durationMinutes: number;
  pricingMode?: CalculatorPricingMode;
  maxQuantity?: number;
  parentCode?: string;
  sortOrder: number;
}

const options: SeedOption[] = [
  {
    kind: 'TECHNIQUE',
    code: 'softgel',
    name: 'Soft Gel',
    iconText: '💅',
    priceCents: 0,
    durationMinutes: 60,
    sortOrder: 10,
  },
  {
    kind: 'TECHNIQUE',
    code: 'rubber',
    name: 'Esmaltado con Rubber',
    iconText: '✨',
    priceCents: 30000,
    durationMinutes: 60,
    sortOrder: 20,
  },
  {
    kind: 'TECHNIQUE',
    code: 'gelconst',
    name: 'Gel de Construcción',
    iconText: '💎',
    priceCents: 35000,
    durationMinutes: 75,
    sortOrder: 30,
  },
  ...[400, 450, 450, 500, 500, 550, 600, 700, 700].map((price, index) => ({
    kind: 'LENGTH' as const,
    code: `softgel-largo-${index + 1}`,
    name: `Largo ${index + 1}`,
    iconText: String(index + 1),
    priceCents: price * 100,
    durationMinutes: index < 3 ? 60 : index < 6 ? 90 : 120,
    parentCode: 'softgel',
    sortOrder: (index + 1) * 10,
  })),
  ...[
    ['espejo', 'Espejo', '🪞', 5],
    ['aurora', 'Aurora', '🌈', 5],
    ['sueter', 'Suéter', '🧶', 5],
    ['carey', 'Carey', '🐢', 15],
    ['blooming', 'Blooming', '🌸', 5],
    ['ojogato', 'Ojo de gato', '🐱', 5],
    ['relieve', 'Relieve pequeño', '🏔️', 5],
    ['relievecrom', 'Relieve + cromo', '✨', 10],
    ['3d', 'Diseño 3D', '🎨', 15],
    ['frances', 'Francés', '🤍', 10],
    ['nailsimple', 'Nail art simple', '🖌️', 5],
    ['nailcomp', 'Nail art complejo', '🎭', 15],
    ['piedritas', 'Piedritas grandes', '💎', 5],
    ['dijes', 'Dijes', '📿', 15],
    ['sticker', 'Sticker', '🏷️', 5],
    ['otros', 'Otros', '🔮', 5],
  ].map(([code, name, iconText, price], index) => ({
    kind: 'DECORATION' as const,
    code: String(code),
    name: String(name),
    iconText: String(iconText),
    priceCents: Number(price) * 100,
    durationMinutes: Number(price) >= 15 ? 5 : 2,
    pricingMode: 'PER_UNIT' as const,
    maxQuantity: 10,
    sortOrder: (index + 1) * 10,
  })),
  {
    kind: 'EXTRA',
    code: 'extra-tones',
    name: 'Tono extra',
    iconText: '🎨',
    priceCents: 500,
    durationMinutes: 2,
    pricingMode: 'PER_UNIT',
    maxQuantity: 20,
    sortOrder: 10,
  },
  {
    kind: 'EXTRA',
    code: 'shape-change',
    name: 'Cambio de forma',
    iconText: '💅',
    priceCents: 2000,
    durationMinutes: 10,
    sortOrder: 20,
  },
  {
    kind: 'EXTRA',
    code: 'retiro',
    name: 'Retiro',
    iconText: '🗑️',
    priceCents: 1000,
    durationMinutes: 5,
    pricingMode: 'PER_UNIT',
    maxQuantity: 10,
    sortOrder: 30,
  },
  {
    kind: 'EXTRA',
    code: 'repo-softgel',
    name: 'Reparación Soft Gel',
    iconText: '🔧',
    priceCents: 1500,
    durationMinutes: 5,
    pricingMode: 'PER_UNIT',
    maxQuantity: 10,
    sortOrder: 40,
  },
  {
    kind: 'EXTRA',
    code: 'repo-gel',
    name: 'Reparación Gel semipermanente',
    iconText: '🔧',
    priceCents: 1000,
    durationMinutes: 5,
    pricingMode: 'PER_UNIT',
    maxQuantity: 10,
    sortOrder: 50,
  },
];

@Injectable()
export class CatalogBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(CatalogBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const count = await this.prisma.calculatorOption.count();
    if (count > 0) return;
    const ids = new Map<string, string>();
    for (const option of options.filter((item) => !item.parentCode)) {
      const created = await this.createOption(option);
      ids.set(option.code, created.id);
    }
    for (const option of options.filter((item) => item.parentCode)) {
      await this.createOption(option, ids.get(option.parentCode || ''));
    }
    this.logger.log(`Calculadora inicializada con ${options.length} opciones migradas de Canva.`);
  }

  private createOption(option: SeedOption, parentOptionId?: string) {
    const data: Prisma.CalculatorOptionCreateInput = {
      kind: option.kind,
      code: option.code,
      name: option.name,
      iconText: option.iconText,
      priceCents: option.priceCents,
      durationMinutes: option.durationMinutes,
      pricingMode: option.pricingMode ?? 'FIXED',
      maxQuantity: option.maxQuantity ?? 1,
      sortOrder: option.sortOrder,
      ...(parentOptionId ? { parent: { connect: { id: parentOptionId } } } : {}),
    };
    return this.prisma.calculatorOption.create({ data });
  }
}
