import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma.service';

@Injectable()
export class BootstrapLoyaltyService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if ((await this.prisma.rewardRule.count()) > 0) return;
    const administrator = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'asc' },
    });
    if (!administrator) return;
    const rule = await this.prisma.rewardRule.create({
      data: {
        visitNumber: 2,
        title: '10% en tu siguiente cita',
        description:
          'Presenta este beneficio a tu manicurista antes de realizar el pago en el estudio.',
        iconText: '10%',
        active: true,
        createdByUserId: administrator.id,
      },
    });
    const eligible = await this.prisma.clientVisitEntry.groupBy({
      by: ['clientId'],
      _sum: { delta: true },
      having: { delta: { _sum: { gte: rule.visitNumber } } },
    });
    if (eligible.length) {
      await this.prisma.clientCoupon.createMany({
        data: eligible.map(({ clientId }) => ({
          clientId,
          rewardRuleId: rule.id,
          source: 'VISIT_REWARD',
          title: rule.title,
          description: rule.description,
          iconText: rule.iconText,
          issuedByUserId: administrator.id,
        })),
        skipDuplicates: true,
      });
    }
  }
}
