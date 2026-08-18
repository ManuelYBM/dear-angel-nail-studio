export const JOB_SCHEDULES = [
  ['notification-deliveries', 30_000],
  ['appointment-reminders', 5 * 60_000],
  ['payment-expiry', 60_000],
  ['receipt-retention', 6 * 60 * 60_000],
  ['pending-registration-cleanup', 60 * 60_000],
] as const;

export type BackgroundJobName = (typeof JOB_SCHEDULES)[number][0];

export function isBackgroundJobName(name: string): name is BackgroundJobName {
  return JOB_SCHEDULES.some(([candidate]) => candidate === name);
}

export function internalJobUrl(apiUrl: string, name: BackgroundJobName): string {
  return `${apiUrl.replace(/\/$/, '')}/internal/jobs/${name}`;
}
