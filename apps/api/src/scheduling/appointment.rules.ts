import type { AppointmentStatus } from '@prisma/client';

export function canCloseAppointment(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus,
  startAt: Date,
  endAt: Date,
  now = new Date(),
): boolean {
  if (currentStatus !== 'CONFIRMED') return false;
  if (targetStatus === 'NO_SHOW') return startAt.getTime() <= now.getTime();
  if (targetStatus === 'COMPLETED') return endAt.getTime() <= now.getTime();
  return false;
}
