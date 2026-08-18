import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsBootstrapService } from './notifications-bootstrap.service';

const original = { ...process.env };

describe('NotificationsBootstrapService', () => {
  beforeEach(() => {
    for (const name of [
      'WHATSAPP_TEMPLATE_APPOINTMENT_UPDATE',
      'WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER',
      'WHATSAPP_TEMPLATE_QUOTE_UPDATE',
      'WHATSAPP_TEMPLATE_PAYMENT_UPDATE',
      'WHATSAPP_TEMPLATE_COUPON_UNLOCKED',
    ]) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    process.env = { ...original };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('por defecto delega al worker, siembra plantillas y no crea timers', async () => {
    vi.useFakeTimers();
    delete process.env.BACKGROUND_JOBS_MODE;
    const prisma = {
      notificationTemplate: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const notifications = {
      processPending: vi.fn(),
      queueAppointmentReminders: vi.fn(),
    };
    const service = new NotificationsBootstrapService(prisma as never, notifications as never);

    await service.onApplicationBootstrap();

    expect(prisma.notificationTemplate.upsert).toHaveBeenCalledTimes(5);
    expect(notifications.processPending).not.toHaveBeenCalled();
    expect(notifications.queueAppointmentReminders).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sólo crea timers dentro del API cuando se solicita explícitamente', async () => {
    vi.useFakeTimers();
    process.env.BACKGROUND_JOBS_MODE = 'api';
    const prisma = {
      notificationTemplate: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const notifications = {
      processPending: vi.fn().mockResolvedValue({ processed: 0 }),
      queueAppointmentReminders: vi.fn().mockResolvedValue({ appointments: 0 }),
    };
    const service = new NotificationsBootstrapService(prisma as never, notifications as never);

    await service.onApplicationBootstrap();
    expect(notifications.processPending).toHaveBeenCalledOnce();
    expect(notifications.queueAppointmentReminders).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(2);
    service.onApplicationShutdown();
  });

  it('completa desde el entorno sólo los nombres de plantilla que siguen vacíos', async () => {
    process.env.WHATSAPP_TEMPLATE_APPOINTMENT_UPDATE = 'dear_angel_appointment_update';
    const prisma = {
      notificationTemplate: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const notifications = {
      processPending: vi.fn(),
      queueAppointmentReminders: vi.fn(),
    };
    const service = new NotificationsBootstrapService(prisma as never, notifications as never);

    await service.onApplicationBootstrap();

    expect(prisma.notificationTemplate.updateMany).toHaveBeenCalledOnce();
    expect(prisma.notificationTemplate.updateMany).toHaveBeenCalledWith({
      where: { key: 'appointment_update', whatsappTemplateName: null },
      data: { whatsappTemplateName: 'dear_angel_appointment_update' },
    });
  });
});
