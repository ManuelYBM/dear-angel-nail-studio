import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import { ReportsService } from './reports.service';

describe('ReportsService exports', () => {
  const prisma = {
    appointment: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const time = {
    timeZone: 'America/Merida',
    dateKey: vi.fn((value: Date) => value.toISOString().slice(0, 10)),
    startOfDate: vi.fn((value: string) => new Date(`${value}T06:00:00.000Z`)),
    nextDate: vi.fn((value: string) => {
      const date = new Date(`${value}T12:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      return date.toISOString().slice(0, 10);
    }),
    assertDate: vi.fn(),
    dateDistance: vi.fn(() => 0),
  };

  it('creates an XLSX workbook that contains the expected Open XML parts', async () => {
    const service = new ReportsService(prisma as never, time as never);
    const result = await service.export('appointments', 'xlsx', {
      from: '2026-08-12',
      to: '2026-08-12',
    });
    const archive = unzipSync(new Uint8Array(result.buffer));

    expect(result.mimeType).toContain('spreadsheetml');
    expect(archive['[Content_Types].xml']).toBeDefined();
    expect(archive['xl/workbook.xml']).toBeDefined();
    expect(archive['xl/worksheets/sheet1.xml']).toBeDefined();
    expect(Buffer.from(archive['xl/worksheets/sheet1.xml'] ?? []).toString('utf8')).toContain(
      'Fecha',
    );
  });

  it('prefixes spreadsheet formulas in CSV cells', async () => {
    prisma.appointment.findMany.mockResolvedValueOnce([
      {
        id: 'appointment',
        startAt: new Date('2026-08-12T16:00:00.000Z'),
        endAt: new Date('2026-08-12T17:00:00.000Z'),
        durationMinutes: 60,
        status: 'CONFIRMED',
        source: 'MANUAL',
        technician: { id: 'technician', fullName: 'Manicurista' },
        client: null,
        guestName: '=WEBSERVICE("https://example.invalid")',
        guestPhone: null,
        catalogDesign: null,
        depositPayment: null,
        notes: null,
      },
    ]);
    const service = new ReportsService(prisma as never, time as never);
    const result = await service.export('appointments', 'csv', {
      from: '2026-08-12',
      to: '2026-08-12',
    });

    expect(result.buffer.toString('utf8')).toContain("'=WEBSERVICE");
  });
});
