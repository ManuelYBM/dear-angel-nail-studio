import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Appointment, User } from '@prisma/client';

import { PrismaService } from '../infrastructure/prisma.service';
import type { DayPeriodDto, WorkingPeriodDto } from './scheduling.dto';
import { TimeService } from './time.service';

interface Period {
  startMinute: number;
  endMinute: number;
}

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
  ) {}

  getPolicy() {
    return this.prisma.bookingPolicy.findUniqueOrThrow({ where: { id: 'default' } });
  }

  async getGlobalConfiguration() {
    const [policy, periods, technicians] = await Promise.all([
      this.getPolicy(),
      this.prisma.globalWorkingPeriod.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { role: 'NAIL_TECHNICIAN', status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          fullName: true,
          status: true,
          technicianSchedule: {
            select: { usesGlobalSchedule: true, acceptingBookings: true },
          },
        },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    return { policy, periods, technicians };
  }

  async listTechnicians() {
    const technicians = await this.prisma.user.findMany({
      where: {
        role: 'NAIL_TECHNICIAN',
        status: 'ACTIVE',
        technicianSchedule: { acceptingBookings: true },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return { items: technicians };
  }

  async getTechnicianSchedule(technicianId: string) {
    await this.assertTechnician(technicianId);
    const schedule = await this.ensureSchedule(technicianId);
    const [globalPeriods, weeklyPeriods, overrides] = await Promise.all([
      this.prisma.globalWorkingPeriod.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.technicianWorkingPeriod.findMany({
        where: { technicianId },
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.scheduleDayOverride.findMany({
        where: {
          technicianId,
          date: { gte: this.time.databaseDate(this.time.dateKey(new Date())) },
        },
        include: { periods: { orderBy: { startMinute: 'asc' } } },
        orderBy: { date: 'asc' },
        take: 30,
      }),
    ]);
    return {
      schedule,
      effectiveWeeklyPeriods: schedule.usesGlobalSchedule ? globalPeriods : weeklyPeriods,
      customWeeklyPeriods: weeklyPeriods,
      globalPeriods,
      overrides,
    };
  }

  async updateWeekly(technicianId: string, periods: WorkingPeriodDto[]) {
    await this.assertTechnician(technicianId);
    const normalized = this.validateWeekly(periods);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.technicianSchedule.upsert({
        where: { technicianId },
        update: { usesGlobalSchedule: false },
        create: { technicianId, usesGlobalSchedule: false },
      });
      await transaction.technicianWorkingPeriod.deleteMany({ where: { technicianId } });
      if (normalized.length) {
        await transaction.technicianWorkingPeriod.createMany({
          data: normalized.map((period) => ({ technicianId, ...period })),
        });
      }
    });
    return {
      schedule: await this.getTechnicianSchedule(technicianId),
      warnings: await this.findScheduleWarnings(technicianId),
    };
  }

  async useGlobalSchedule(technicianId: string) {
    await this.assertTechnician(technicianId);
    await this.prisma.technicianSchedule.upsert({
      where: { technicianId },
      update: { usesGlobalSchedule: true },
      create: { technicianId, usesGlobalSchedule: true },
    });
    return {
      schedule: await this.getTechnicianSchedule(technicianId),
      warnings: await this.findScheduleWarnings(technicianId),
    };
  }

  async setAcceptingBookings(technicianId: string, acceptingBookings: boolean) {
    await this.assertTechnician(technicianId);
    const schedule = await this.prisma.technicianSchedule.upsert({
      where: { technicianId },
      update: { acceptingBookings },
      create: { technicianId, acceptingBookings },
    });
    return { schedule };
  }

  async setOverride(
    technicianId: string,
    date: string,
    isClosed: boolean,
    periods: DayPeriodDto[],
  ) {
    await this.assertTechnician(technicianId);
    this.time.assertDate(date);
    const normalized = this.validateDay(periods);
    if (isClosed && normalized.length) {
      throw new BadRequestException({
        code: 'CLOSED_DAY_HAS_PERIODS',
        message: 'Un día cerrado no puede contener periodos disponibles.',
      });
    }
    await this.ensureSchedule(technicianId);
    const databaseDate = this.time.databaseDate(date);
    const override = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.scheduleDayOverride.upsert({
        where: { technicianId_date: { technicianId, date: databaseDate } },
        update: { isClosed },
        create: { technicianId, date: databaseDate, isClosed },
      });
      await transaction.scheduleOverridePeriod.deleteMany({ where: { overrideId: record.id } });
      if (!isClosed && normalized.length) {
        await transaction.scheduleOverridePeriod.createMany({
          data: normalized.map((period) => ({ overrideId: record.id, ...period })),
        });
      }
      return transaction.scheduleDayOverride.findUniqueOrThrow({
        where: { id: record.id },
        include: { periods: { orderBy: { startMinute: 'asc' } } },
      });
    });
    return { override, warnings: await this.findScheduleWarnings(technicianId, date) };
  }

  async removeOverride(technicianId: string, date: string) {
    await this.assertTechnician(technicianId);
    this.time.assertDate(date);
    await this.prisma.scheduleDayOverride.deleteMany({
      where: { technicianId, date: this.time.databaseDate(date) },
    });
    return { removed: true, warnings: await this.findScheduleWarnings(technicianId, date) };
  }

  async updateGlobal(periods: WorkingPeriodDto[]) {
    const normalized = this.validateWeekly(periods);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.globalWorkingPeriod.deleteMany();
      if (normalized.length) await transaction.globalWorkingPeriod.createMany({ data: normalized });
    });
    const inherited = await this.prisma.technicianSchedule.findMany({
      where: { usesGlobalSchedule: true },
      select: { technicianId: true },
    });
    const warnings = (
      await Promise.all(
        inherited.map(({ technicianId }) => this.findScheduleWarnings(technicianId)),
      )
    ).flat();
    return {
      periods: await this.prisma.globalWorkingPeriod.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      }),
      warnings,
    };
  }

  async updatePolicy(data: {
    defaultDurationMinutes: number;
    slotIntervalMinutes: number;
    minimumLeadMinutes: number;
    maximumAdvanceDays: number;
    holdMinutes: number;
    rescheduleNoticeHours: number;
    clientRescheduleLimit: number;
  }) {
    return this.prisma.bookingPolicy.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    });
  }

  async periodsFor(technicianId: string, date: string): Promise<Period[]> {
    const schedule = await this.ensureSchedule(technicianId);
    const override = await this.prisma.scheduleDayOverride.findUnique({
      where: { technicianId_date: { technicianId, date: this.time.databaseDate(date) } },
      include: { periods: { orderBy: { startMinute: 'asc' } } },
    });
    if (override) {
      return override.isClosed
        ? []
        : override.periods.map(({ startMinute, endMinute }) => ({ startMinute, endMinute }));
    }
    const dayOfWeek = this.time.dayOfWeek(date);
    if (schedule.usesGlobalSchedule) {
      return this.prisma.globalWorkingPeriod.findMany({
        where: { dayOfWeek },
        select: { startMinute: true, endMinute: true },
        orderBy: { startMinute: 'asc' },
      });
    }
    return this.prisma.technicianWorkingPeriod.findMany({
      where: { technicianId, dayOfWeek },
      select: { startMinute: true, endMinute: true },
      orderBy: { startMinute: 'asc' },
    });
  }

  async isWithinAvailability(technicianId: string, startAt: Date, endAt: Date): Promise<boolean> {
    const date = this.time.dateKey(startAt);
    const startMinute = this.time.minuteOfDay(startAt);
    const endDate = this.time.dateKey(endAt);
    const rawEndMinute = this.time.minuteOfDay(endAt);
    const endMinute =
      endDate === date
        ? rawEndMinute
        : endDate === this.time.nextDate(date) && rawEndMinute === 0
          ? 1440
          : -1;
    if (endMinute < 0) return false;
    const periods = await this.periodsFor(technicianId, date);
    return periods.some(
      (period) => period.startMinute <= startMinute && period.endMinute >= endMinute,
    );
  }

  async activeTechnicians(technicianId?: string): Promise<Array<Pick<User, 'id' | 'fullName'>>> {
    return this.prisma.user.findMany({
      where: {
        ...(technicianId ? { id: technicianId } : {}),
        role: 'NAIL_TECHNICIAN',
        status: 'ACTIVE',
        technicianSchedule: { acceptingBookings: true },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  private async ensureSchedule(technicianId: string) {
    return this.prisma.technicianSchedule.upsert({
      where: { technicianId },
      update: {},
      create: { technicianId },
    });
  }

  private async assertTechnician(technicianId: string): Promise<void> {
    const exists = await this.prisma.user.count({
      where: { id: technicianId, role: 'NAIL_TECHNICIAN', status: { not: 'ARCHIVED' } },
    });
    if (!exists) {
      throw new NotFoundException({
        code: 'TECHNICIAN_NOT_FOUND',
        message: 'No encontramos esta manicurista.',
      });
    }
  }

  private validateWeekly(periods: WorkingPeriodDto[]): WorkingPeriodDto[] {
    for (let day = 1; day <= 7; day += 1) {
      this.validateDay(periods.filter((period) => period.dayOfWeek === day));
    }
    return [...periods].sort(
      (left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinute - right.startMinute,
    );
  }

  private validateDay<T extends Period>(periods: T[]): T[] {
    const sorted = [...periods].sort((left, right) => left.startMinute - right.startMinute);
    for (let index = 0; index < sorted.length; index += 1) {
      const period = sorted[index];
      const previous = sorted[index - 1];
      if (!period || period.startMinute >= period.endMinute) {
        throw new BadRequestException({
          code: 'INVALID_WORKING_PERIOD',
          message: 'Cada periodo debe terminar después de comenzar.',
        });
      }
      if (previous && previous.endMinute > period.startMinute) {
        throw new BadRequestException({
          code: 'OVERLAPPING_WORKING_PERIODS',
          message: 'Los periodos de trabajo de un mismo día no pueden traslaparse.',
        });
      }
    }
    return sorted;
  }

  private async findScheduleWarnings(technicianId: string, date?: string) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        technicianId,
        startAt: {
          gte: date ? this.time.startOfDate(date) : new Date(),
          ...(date ? { lt: this.time.startOfDate(this.time.nextDate(date)) } : {}),
        },
        status: { in: ['HELD', 'PENDING_PAYMENT', 'CONFIRMED'] },
      },
      include: { client: { select: { fullName: true } } },
      orderBy: { startAt: 'asc' },
    });
    const warnings: Array<{
      appointmentId: string;
      startAt: Date;
      endAt: Date;
      clientName: string;
    }> = [];
    for (const appointment of appointments) {
      if (
        !(await this.isWithinAvailability(technicianId, appointment.startAt, appointment.endAt))
      ) {
        warnings.push({
          appointmentId: appointment.id,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
          clientName: this.appointmentName(appointment),
        });
      }
    }
    return warnings;
  }

  private appointmentName(
    appointment: Appointment & { client: { fullName: string } | null },
  ): string {
    return appointment.client?.fullName ?? appointment.guestName ?? 'Clienta sin nombre';
  }
}
