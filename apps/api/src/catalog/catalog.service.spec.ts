import { describe, expect, it, vi } from 'vitest';

import { CatalogService } from './catalog.service';

const technician = {
  id: 'tech-id',
  role: 'NAIL_TECHNICIAN',
  status: 'ACTIVE',
  fullName: 'Técnica',
  phone: null,
  email: 'tech@example.com',
  mustChangePassword: false,
};

function quote(assignedTechnicianId: string | null = null) {
  return {
    id: 'quote-id',
    clientId: 'client-id',
    status: assignedTechnicianId ? 'IN_REVIEW' : 'PENDING_REVIEW',
    assignedTechnicianId,
    preferredTechnicianId: null,
    updatedAt: new Date('2026-08-14T12:00:00.000Z'),
    client: {
      id: 'client-id',
      fullName: 'Clienta',
      phone: '+529991234567',
      email: 'client@example.com',
    },
    images: [],
    selections: [],
  };
}

const request = { headers: {}, socket: {} };

describe('CatalogService quote privacy and transitions', () => {
  it('redacta contacto antes de que la técnica reclame una cotización abierta', async () => {
    const prisma = {
      customQuote: { findMany: vi.fn().mockResolvedValue([quote()]) },
    };
    const service = new CatalogService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.listQuotes(technician as never);
    const client = result.items[0]?.client as { phone: string | null; email: string | null };

    expect(client.phone).toBeNull();
    expect(client.email).toBeNull();
  });

  it('conserva el contacto para la técnica responsable después del reclamo', async () => {
    const prisma = {
      customQuote: { findMany: vi.fn().mockResolvedValue([quote('tech-id')]) },
    };
    const service = new CatalogService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.listQuotes(technician as never);
    const client = result.items[0]?.client as { phone: string | null };

    expect(client.phone).toBe('+529991234567');
  });

  it('sólo asigna técnicas activas que sigan aceptando citas', async () => {
    const findFirstOrThrow = vi.fn().mockRejectedValue(new Error('not found'));
    const prisma = { user: { findFirstOrThrow } };
    const service = new CatalogService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.assignQuote(
        { ...technician, role: 'ADMIN' } as never,
        'quote-id',
        { technicianId: 'tech-id' },
        {} as never,
      ),
    ).rejects.toThrow();
    expect(findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: 'tech-id',
        role: 'NAIL_TECHNICIAN',
        status: 'ACTIVE',
        technicianSchedule: { acceptingBookings: true },
      },
    });
  });

  it('condiciona la revisión a la versión y responsable observadas', async () => {
    const current = quote('tech-id');
    const updateMany = vi
      .fn<
        (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{
          count: number;
        }>
      >()
      .mockResolvedValue({ count: 0 });
    const prisma = {
      customQuote: {
        findUnique: vi.fn().mockResolvedValue(current),
        updateMany,
      },
    };
    const service = new CatalogService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.reviewQuote(
        technician as never,
        'quote-id',
        { status: 'REJECTED' } as never,
        {} as never,
      ),
    ).rejects.toThrow();
    expect(updateMany.mock.calls[0]?.[0].where).toMatchObject({
      updatedAt: current.updatedAt,
      assignedTechnicianId: 'tech-id',
    });
  });

  it('no aprueba una cotización si la responsable dejó de aceptar citas', async () => {
    const current = quote('tech-id');
    const updateMany = vi.fn();
    const prisma = {
      customQuote: { findUnique: vi.fn().mockResolvedValue(current), updateMany },
      user: { findFirstOrThrow: vi.fn().mockRejectedValue(new Error('not available')) },
    };
    const service = new CatalogService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.reviewQuote(
        technician as never,
        'quote-id',
        {
          status: 'APPROVED',
          confirmedPriceCents: 50_000,
          confirmedDurationMinutes: 90,
        } as never,
        request as never,
      ),
    ).rejects.toThrow(/activa/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('no agrega una imagen si la cotización cambió durante la carga', async () => {
    const current = { ...quote(), _count: { images: 4 } };
    const tx = {
      customQuote: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      quoteImage: { count: vi.fn(), create: vi.fn() },
    };
    const prisma = {
      customQuote: { findUnique: vi.fn().mockResolvedValue(current) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const storage = {
      putObject: vi.fn(),
      removeObject: vi.fn().mockResolvedValue(undefined),
    };
    const service = new CatalogService(prisma as never, {} as never, storage as never, {} as never);

    await expect(
      service.uploadQuoteImage(
        { ...technician, id: 'client-id', role: 'CLIENT' } as never,
        'quote-id',
        {
          buffer: Buffer.from('image'),
          mimetype: 'image/png',
          originalname: 'idea.png',
          size: 5,
        },
        {} as never,
      ),
    ).rejects.toThrow();
    expect(tx.quoteImage.create).not.toHaveBeenCalled();
    expect(storage.removeObject).toHaveBeenCalledOnce();
  });

  it('cancela con CAS y no reporta fallo si la notificación interna no puede enviarse', async () => {
    const current = {
      ...quote('tech-id'),
      appointments: [],
    };
    const cancelled = { ...quote('tech-id'), status: 'CANCELLED' };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      customQuote: {
        findUnique: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(cancelled),
        updateMany,
      },
    };
    const audit = { record: vi.fn() };
    const notifications = { notifyMany: vi.fn().mockRejectedValue(new Error('delivery down')) };
    const service = new CatalogService(
      prisma as never,
      audit as never,
      {} as never,
      notifications as never,
    );

    const result = await service.cancelQuote(
      {
        ...technician,
        id: 'client-id',
        role: 'CLIENT',
        fullName: 'Clienta',
      } as never,
      'quote-id',
      request as never,
    );

    expect(result.quote.status).toBe('CANCELLED');
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'quote-id',
        clientId: 'client-id',
        status: { in: ['PENDING_REVIEW', 'IN_REVIEW'] },
        updatedAt: current.updatedAt,
        assignedTechnicianId: 'tech-id',
        preferredTechnicianId: null,
      },
      data: { status: 'CANCELLED' },
    });
    expect(audit.record).toHaveBeenCalledOnce();
    expect(notifications.notifyMany).toHaveBeenCalledOnce();
  });

  it('cambia la portada reordenando la galería sin borrar imágenes', async () => {
    const image = { id: 'image-id', designId: 'design-id' };
    const design = { id: 'design-id', images: [{ ...image, sortOrder: 0 }] };
    const tx = {
      catalogDesignImage: {
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
        update: vi.fn().mockResolvedValue({ ...image, sortOrder: 0 }),
      },
      catalogDesign: { findUniqueOrThrow: vi.fn().mockResolvedValue(design) },
    };
    const prisma = {
      catalogDesignImage: { findUnique: vi.fn().mockResolvedValue(image) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: vi.fn() };
    const storage = { removeObject: vi.fn() };
    const service = new CatalogService(
      prisma as never,
      audit as never,
      storage as never,
      {} as never,
    );

    await expect(
      service.setDesignCover(technician as never, image.id, request as never),
    ).resolves.toEqual({
      design,
    });
    expect(tx.catalogDesignImage.updateMany).toHaveBeenCalledWith({
      where: { designId: 'design-id' },
      data: { sortOrder: { increment: 1 } },
    });
    expect(tx.catalogDesignImage.update).toHaveBeenCalledWith({
      where: { id: 'image-id' },
      data: { sortOrder: 0 },
    });
    expect(storage.removeObject).not.toHaveBeenCalled();
  });
});
