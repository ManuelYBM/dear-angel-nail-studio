import type { AppointmentStatus } from '@prisma/client';

export function totalVisits(entries: ReadonlyArray<{ delta: number }>) {
  return entries.reduce((total, entry) => total + entry.delta, 0);
}

export function eligibleMilestones(
  visitCount: number,
  rules: ReadonlyArray<{ id: string; visitNumber: number; active: boolean }>,
) {
  return rules
    .filter((rule) => rule.active && rule.visitNumber <= visitCount)
    .map((rule) => rule.id);
}

export function canRedeemOnAppointment(status: AppointmentStatus) {
  return status === 'CONFIRMED' || status === 'COMPLETED';
}
