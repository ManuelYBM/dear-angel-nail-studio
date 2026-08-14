import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma.service';

@Injectable()
export class BootstrapSchedulingService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.bookingPolicy.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });

    const globalPeriods = await this.prisma.globalWorkingPeriod.count();
    if (globalPeriods === 0) {
      await this.prisma.globalWorkingPeriod.createMany({
        data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 8 * 60,
          endMinute: 24 * 60,
        })),
      });
    }

    const technicians = await this.prisma.user.findMany({
      where: { role: 'NAIL_TECHNICIAN' },
      select: { id: true },
    });
    await Promise.all(
      technicians.map(({ id }) =>
        this.prisma.technicianSchedule.upsert({
          where: { technicianId: id },
          update: {},
          create: { technicianId: id },
        }),
      ),
    );
  }
}
