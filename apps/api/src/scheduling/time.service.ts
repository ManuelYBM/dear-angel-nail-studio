import { BadRequestException, Injectable } from '@nestjs/common';
import { addDays, addMinutes, differenceInCalendarDays, getISODay, isMatch } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

@Injectable()
export class TimeService {
  readonly timeZone = process.env.BUSINESS_TIME_ZONE || process.env.TZ || 'America/Merida';

  assertDate(value: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isMatch(value, 'yyyy-MM-dd')) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'La fecha debe tener formato AAAA-MM-DD.',
      });
    }
  }

  startOfDate(date: string): Date {
    this.assertDate(date);
    return fromZonedTime(`${date}T00:00:00`, this.timeZone);
  }

  dateAndMinute(date: string, minute: number): Date {
    return addMinutes(this.startOfDate(date), minute);
  }

  dateKey(date: Date): string {
    return formatInTimeZone(date, this.timeZone, 'yyyy-MM-dd');
  }

  minuteOfDay(date: Date): number {
    return (
      Number(formatInTimeZone(date, this.timeZone, 'H')) * 60 +
      Number(formatInTimeZone(date, this.timeZone, 'm'))
    );
  }

  dayOfWeek(date: string): number {
    return getISODay(toZonedTime(this.startOfDate(date), this.timeZone));
  }

  nextDate(date: string): string {
    return formatInTimeZone(addDays(this.startOfDate(date), 1), this.timeZone, 'yyyy-MM-dd');
  }

  dateDistance(from: string, to: string): number {
    return differenceInCalendarDays(this.startOfDate(to), this.startOfDate(from));
  }

  databaseDate(date: string): Date {
    this.assertDate(date);
    return new Date(`${date}T00:00:00.000Z`);
  }
}
