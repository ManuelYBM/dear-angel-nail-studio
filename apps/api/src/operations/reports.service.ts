import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AppointmentStatus as AppointmentStatusValue,
  DepositStatus as DepositStatusValue,
} from '@prisma/client';
import type { AppointmentStatus, Prisma } from '@prisma/client';
import { addDays } from 'date-fns';
import { strToU8, zipSync } from 'fflate';

import { PrismaService } from '../infrastructure/prisma.service';
import { TimeService } from '../scheduling/time.service';
import type {
  AppointmentReportQueryDto,
  AuditQueryDto,
  DepositReportQueryDto,
  ReportExportQueryDto,
  ReportRangeDto,
} from './operations.dto';

export type ExportDataset = 'appointments' | 'deposits' | 'clients' | 'designs' | 'audit';
export type ExportFormat = 'csv' | 'xlsx';

interface NormalizedRange {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
  ) {}

  async dashboard(query: ReportRangeDto) {
    const range = this.range(query);
    const appointmentWhere = this.appointmentRange(range);
    const [appointments, deposits, popularDesigns, frequentClients, newClients] = await Promise.all(
      [
        this.prisma.appointment.findMany({
          where: appointmentWhere,
          select: { status: true, startAt: true },
        }),
        this.prisma.depositPayment.findMany({
          where: { appointment: appointmentWhere },
          select: { status: true, amountCents: true },
        }),
        this.designRows(range, 5),
        this.clientRows(range, 5),
        this.prisma.user.count({
          where: {
            role: 'CLIENT',
            registrationExpiresAt: null,
            createdAt: { gte: range.start, lt: range.endExclusive },
          },
        }),
      ],
    );

    const appointmentCounts = this.countBy(appointments.map(({ status }) => status));
    const depositCounts = this.countBy(deposits.map(({ status }) => status));
    const dailyMap = new Map<string, Record<AppointmentStatus, number>>();
    for (const appointment of appointments) {
      const date = this.time.dateKey(appointment.startAt);
      const current = dailyMap.get(date) ?? this.emptyAppointmentCounts();
      current[appointment.status] += 1;
      dailyMap.set(date, current);
    }
    const days: Array<{ date: string; total: number; completed: number; cancelled: number }> = [];
    let cursor = range.start;
    while (cursor < range.endExclusive && days.length < 370) {
      const date = this.time.dateKey(cursor);
      const counts = dailyMap.get(date) ?? this.emptyAppointmentCounts();
      days.push({
        date,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        completed: counts.COMPLETED,
        cancelled: counts.CANCELLED + counts.NO_SHOW,
      });
      cursor = addDays(cursor, 1);
    }

    return {
      range: { from: range.from, to: range.to, timeZone: this.time.timeZone },
      appointments: {
        total: appointments.length,
        counts: appointmentCounts,
        attended: appointmentCounts.COMPLETED ?? 0,
        noShows: appointmentCounts.NO_SHOW ?? 0,
        cancellations: appointmentCounts.CANCELLED ?? 0,
        upcoming: appointmentCounts.CONFIRMED ?? 0,
      },
      deposits: {
        total: deposits.length,
        counts: depositCounts,
        approvedAmountCents: deposits
          .filter(({ status }) => status === 'APPROVED')
          .reduce((sum, deposit) => sum + deposit.amountCents, 0),
        pendingReview: depositCounts.PENDING_REVIEW ?? 0,
      },
      clients: { new: newClients, frequent: frequentClients },
      designs: popularDesigns,
      daily: days,
    };
  }

  async appointments(query: AppointmentReportQueryDto) {
    const range = this.range(query);
    const items = await this.appointmentRows(range, query);
    return { range: this.publicRange(range), items, total: items.length };
  }

  async deposits(query: DepositReportQueryDto) {
    const range = this.range(query);
    const items = await this.depositRows(range, query);
    return {
      range: this.publicRange(range),
      items,
      total: items.length,
      amountCents: items
        .filter(({ status }) => status === 'APPROVED')
        .reduce((sum, item) => sum + item.amountCents, 0),
    };
  }

  async clients(query: ReportRangeDto) {
    const range = this.range(query);
    const items = await this.clientRows(range, 300);
    return { range: this.publicRange(range), items, total: items.length };
  }

  async designs(query: ReportRangeDto) {
    const range = this.range(query);
    const items = await this.designRows(range, 300);
    return { range: this.publicRange(range), items, total: items.length };
  }

  async technicians() {
    const items = await this.prisma.user.findMany({
      where: { role: 'NAIL_TECHNICIAN', status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true, fullName: true, status: true },
      orderBy: { fullName: 'asc' },
    });
    return { items };
  }

  async audit(query: AuditQueryDto) {
    const range = this.range(query);
    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: range.start, lt: range.endExclusive },
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      ...(query.entityType
        ? { entityType: { contains: query.entityType, mode: 'insensitive' } }
        : {}),
      ...(query.actorRole ? { actor: { role: query.actorRole } } : {}),
    };
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      range: this.publicRange(range),
      items: entries.map((entry) => ({ ...entry, id: entry.id.toString() })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async export(dataset: ExportDataset, format: ExportFormat, query: ReportExportQueryDto) {
    const range = this.range(query);
    const rows = await this.exportRows(dataset, range, query);
    const labels = this.exportColumns(dataset);
    const filename = `dear-angel-${dataset}-${range.from}-${range.to}.${format}`;
    if (format === 'csv') {
      return {
        filename,
        mimeType: 'text/csv; charset=utf-8',
        buffer: Buffer.from(`\uFEFF${this.csv(rows, labels)}`, 'utf8'),
      };
    }
    return {
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: this.xlsx(rows, labels, this.sheetName(dataset)),
    };
  }

  private async appointmentRows(range: NormalizedRange, query: AppointmentReportQueryDto) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        ...this.appointmentRange(range),
        ...(query.status ? { status: query.status } : {}),
        ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      },
      include: {
        technician: { select: { id: true, fullName: true } },
        client: { select: { id: true, fullName: true, phone: true } },
        catalogDesign: { select: { id: true, title: true } },
        depositPayment: { select: { status: true, reference: true, amountCents: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 5000,
    });
    return appointments.map((item) => ({
      id: item.id,
      startAt: item.startAt,
      endAt: item.endAt,
      durationMinutes: item.durationMinutes,
      status: item.status,
      source: item.source,
      technician: item.technician,
      client: item.client,
      guestName: item.guestName,
      guestPhone: item.guestPhone,
      design: item.catalogDesign,
      notes: item.notes,
      deposit: item.depositPayment,
    }));
  }

  private async depositRows(range: NormalizedRange, query: DepositReportQueryDto) {
    const deposits = await this.prisma.depositPayment.findMany({
      where: {
        appointment: this.appointmentRange(range),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        appointment: {
          include: {
            technician: { select: { id: true, fullName: true } },
            client: { select: { id: true, fullName: true, phone: true } },
          },
        },
        reviewedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    return deposits.map((item) => ({
      id: item.id,
      appointmentId: item.appointmentId,
      reference: item.reference,
      amountCents: item.amountCents,
      status: item.status,
      receiptUploadedAt: item.receiptUploadedAt,
      reviewedAt: item.reviewedAt,
      reviewNotes: item.reviewNotes,
      confirmationCode: item.confirmationCode,
      appointment: {
        startAt: item.appointment.startAt,
        technician: item.appointment.technician,
        client: item.appointment.client,
      },
      reviewedBy: item.reviewedBy,
    }));
  }

  private async clientRows(range: NormalizedRange, take: number) {
    const grouped = await this.prisma.appointment.groupBy({
      by: ['clientId'],
      where: {
        ...this.appointmentRange(range),
        clientId: { not: null },
        status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] },
      },
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take,
    });
    const clientIds = grouped
      .map(({ clientId }) => clientId)
      .filter((id): id is string => Boolean(id));
    const [clients, completed, visits] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: clientIds }, registrationExpiresAt: null },
        select: { id: true, fullName: true, phone: true, createdAt: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: {
          ...this.appointmentRange(range),
          clientId: { in: clientIds },
          status: 'COMPLETED',
        },
        _count: { _all: true },
      }),
      this.prisma.clientVisitEntry.groupBy({
        by: ['clientId'],
        where: { clientId: { in: clientIds } },
        _sum: { delta: true },
      }),
    ]);
    const byId = new Map(clients.map((client) => [client.id, client]));
    const completedById = new Map(completed.map((row) => [row.clientId, row._count._all]));
    const visitsById = new Map(visits.map((row) => [row.clientId, row._sum.delta ?? 0]));
    return grouped.flatMap((row) => {
      if (!row.clientId) return [];
      const client = byId.get(row.clientId);
      if (!client) return [];
      return [
        {
          ...client,
          appointmentsInRange: row._count._all,
          completedInRange: completedById.get(row.clientId) ?? 0,
          globalVisitCount: visitsById.get(row.clientId) ?? 0,
        },
      ];
    });
  }

  private async designRows(range: NormalizedRange, take: number) {
    const grouped = await this.prisma.appointment.groupBy({
      by: ['catalogDesignId'],
      where: {
        ...this.appointmentRange(range),
        catalogDesignId: { not: null },
        status: { notIn: ['CANCELLED', 'EXPIRED'] },
      },
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take,
    });
    const ids = grouped
      .map(({ catalogDesignId }) => catalogDesignId)
      .filter((id): id is string => Boolean(id));
    const designs = await this.prisma.catalogDesign.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        technique: true,
        priceCents: true,
        durationMinutes: true,
        published: true,
        _count: { select: { favorites: true } },
      },
    });
    const byId = new Map(designs.map((design) => [design.id, design]));
    return grouped.flatMap((row) => {
      if (!row.catalogDesignId) return [];
      const design = byId.get(row.catalogDesignId);
      return design
        ? [
            {
              id: design.id,
              title: design.title,
              technique: design.technique,
              priceCents: design.priceCents,
              durationMinutes: design.durationMinutes,
              published: design.published,
              favorites: design._count.favorites,
              appointmentsInRange: row._count._all,
            },
          ]
        : [];
    });
  }

  private async exportRows(
    dataset: ExportDataset,
    range: NormalizedRange,
    query: ReportExportQueryDto,
  ): Promise<Array<Record<string, string | number | null>>> {
    if (dataset === 'appointments') {
      const status = query.status ? this.appointmentStatus(query.status) : undefined;
      return (
        await this.appointmentRows(range, {
          ...query,
          status,
        })
      ).map((item) => ({
        date: this.time.dateKey(item.startAt),
        time: this.localTime(item.startAt),
        status: item.status,
        source: item.source,
        duration: item.durationMinutes,
        technician: item.technician.fullName,
        client: item.client?.fullName ?? item.guestName ?? '',
        phone: item.client?.phone ?? item.guestPhone ?? '',
        design: item.design?.title ?? '',
        depositStatus: item.deposit?.status ?? '',
        reference: item.deposit?.reference ?? '',
        notes: item.notes ?? '',
      }));
    }
    if (dataset === 'deposits') {
      const status = query.status ? this.depositStatus(query.status) : undefined;
      return (await this.depositRows(range, { ...query, status })).map((item) => ({
        date: this.time.dateKey(item.appointment.startAt),
        time: this.localTime(item.appointment.startAt),
        reference: item.reference,
        status: item.status,
        amount: item.amountCents / 100,
        client: item.appointment.client?.fullName ?? '',
        phone: item.appointment.client?.phone ?? '',
        technician: item.appointment.technician.fullName,
        uploadedAt: this.localDateTime(item.receiptUploadedAt),
        reviewedAt: this.localDateTime(item.reviewedAt),
        reviewedBy: item.reviewedBy?.fullName ?? '',
        notes: item.reviewNotes ?? '',
        folio: item.confirmationCode ?? '',
      }));
    }
    if (dataset === 'clients') {
      return (await this.clientRows(range, 5000)).map((item) => ({
        client: item.fullName,
        phone: item.phone ?? '',
        appointments: item.appointmentsInRange,
        completed: item.completedInRange,
        globalVisits: item.globalVisitCount,
        registeredAt: this.localDateTime(item.createdAt),
      }));
    }
    if (dataset === 'designs') {
      return (await this.designRows(range, 5000)).map((item) => ({
        design: item.title,
        technique: item.technique,
        appointments: item.appointmentsInRange,
        favorites: item.favorites,
        price: item.priceCents / 100,
        duration: item.durationMinutes,
        published: item.published ? 'Sí' : 'No',
      }));
    }
    const entries = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: range.start, lt: range.endExclusive },
        ...(query.action
          ? { action: { contains: query.action, mode: 'insensitive' as const } }
          : {}),
        ...(query.entityType
          ? { entityType: { contains: query.entityType, mode: 'insensitive' as const } }
          : {}),
        ...(query.actorRole ? { actor: { role: query.actorRole } } : {}),
      },
      include: { actor: { select: { fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    return entries.map((entry) => ({
      date: this.localDateTime(entry.createdAt),
      actor: entry.actor?.fullName ?? 'Sistema',
      role: entry.actor?.role ?? '',
      action: entry.action,
      entity: entry.entityType,
      entityId: entry.entityId ?? '',
      ip: entry.ipAddress ?? '',
      detail: entry.metadata ? JSON.stringify(entry.metadata) : '',
    }));
  }

  private exportColumns(dataset: ExportDataset) {
    const maps = {
      appointments: [
        ['date', 'Fecha', 14],
        ['time', 'Hora', 12],
        ['status', 'Estado', 20],
        ['source', 'Origen', 14],
        ['duration', 'Duración (min)', 16],
        ['technician', 'Manicurista', 24],
        ['client', 'Cliente', 24],
        ['phone', 'Teléfono', 18],
        ['design', 'Diseño', 28],
        ['depositStatus', 'Anticipo', 20],
        ['reference', 'Referencia', 20],
        ['notes', 'Notas', 38],
      ],
      deposits: [
        ['date', 'Fecha cita', 14],
        ['time', 'Hora', 12],
        ['reference', 'Referencia', 20],
        ['status', 'Estado', 20],
        ['amount', 'Monto MXN', 14],
        ['client', 'Cliente', 24],
        ['phone', 'Teléfono', 18],
        ['technician', 'Manicurista', 24],
        ['uploadedAt', 'Comprobante', 22],
        ['reviewedAt', 'Revisión', 22],
        ['reviewedBy', 'Revisó', 24],
        ['notes', 'Notas', 38],
        ['folio', 'Folio', 20],
      ],
      clients: [
        ['client', 'Cliente', 28],
        ['phone', 'Teléfono', 18],
        ['appointments', 'Citas del periodo', 18],
        ['completed', 'Atendidas', 14],
        ['globalVisits', 'Visitas globales', 17],
        ['registeredAt', 'Registro', 22],
      ],
      designs: [
        ['design', 'Diseño', 30],
        ['technique', 'Técnica', 22],
        ['appointments', 'Citas del periodo', 18],
        ['favorites', 'Favoritos', 13],
        ['price', 'Precio MXN', 14],
        ['duration', 'Duración (min)', 16],
        ['published', 'Publicado', 12],
      ],
      audit: [
        ['date', 'Fecha y hora', 22],
        ['actor', 'Responsable', 26],
        ['role', 'Rol', 20],
        ['action', 'Acción', 34],
        ['entity', 'Entidad', 22],
        ['entityId', 'Identificador', 38],
        ['ip', 'IP', 18],
        ['detail', 'Detalle', 60],
      ],
    } as const;
    return maps[dataset].map(([key, label, width]) => ({ key, label, width }));
  }

  private range(query: ReportRangeDto): NormalizedRange {
    const today = this.time.dateKey(new Date());
    const defaultFrom = this.time.dateKey(addDays(this.time.startOfDate(today), -29));
    const from = query.from || defaultFrom;
    const to = query.to || today;
    this.time.assertDate(from);
    this.time.assertDate(to);
    const distance = this.time.dateDistance(from, to);
    if (distance < 0 || distance > 366) {
      throw new BadRequestException('Selecciona un periodo válido de hasta 366 días.');
    }
    return {
      from,
      to,
      start: this.time.startOfDate(from),
      endExclusive: this.time.startOfDate(this.time.nextDate(to)),
    };
  }

  private appointmentRange(range: NormalizedRange): Prisma.AppointmentWhereInput {
    return { startAt: { gte: range.start, lt: range.endExclusive } };
  }

  private publicRange(range: NormalizedRange) {
    return { from: range.from, to: range.to, timeZone: this.time.timeZone };
  }

  private countBy(values: string[]) {
    return values.reduce<Record<string, number>>((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  }

  private emptyAppointmentCounts(): Record<AppointmentStatus, number> {
    return {
      HELD: 0,
      PENDING_PAYMENT: 0,
      CONFIRMED: 0,
      CANCELLED: 0,
      COMPLETED: 0,
      NO_SHOW: 0,
      EXPIRED: 0,
    };
  }

  private localTime(value: Date) {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: this.time.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(value);
  }

  private localDateTime(value: Date | null) {
    return value
      ? new Intl.DateTimeFormat('es-MX', {
          timeZone: this.time.timeZone,
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(value)
      : '';
  }

  private csv(
    rows: Array<Record<string, string | number | null>>,
    labels: Array<{ key: string; label: string }>,
  ) {
    const escape = (value: unknown) => {
      const raw =
        typeof value === 'string'
          ? value
          : typeof value === 'number'
            ? String(value)
            : value === null || value === undefined
              ? ''
              : JSON.stringify(value);
      const text = typeof value === 'string' && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [
      labels.map(({ label }) => escape(label)).join(','),
      ...rows.map((row) => labels.map(({ key }) => escape(row[key])).join(',')),
    ].join('\r\n');
  }

  private sheetName(dataset: ExportDataset) {
    return {
      appointments: 'Citas',
      deposits: 'Anticipos',
      clients: 'Clientes',
      designs: 'Diseños',
      audit: 'Auditoría',
    }[dataset];
  }

  private xlsx(
    rows: Array<Record<string, string | number | null>>,
    labels: Array<{ key: string; label: string; width: number }>,
    sheetName: string,
  ) {
    const xml = (value: string) =>
      Array.from(value)
        .filter((character) => {
          const code = character.charCodeAt(0);
          return code === 9 || code === 10 || code === 13 || code >= 32;
        })
        .join('')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
    const cell = (value: string | number | null, column: number, row: number, header = false) => {
      const reference = `${this.columnLetter(column)}${row}`;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${reference}"${header ? ' s="1"' : ''}><v>${value}</v></c>`;
      }
      const raw = value === null ? '' : String(value);
      const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `<c r="${reference}" t="inlineStr"${header ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(safe)}</t></is></c>`;
    };
    const lastColumn = this.columnLetter(labels.length);
    const sheetRows = [
      `<row r="1">${labels.map((item, index) => cell(item.label, index + 1, 1, true)).join('')}</row>`,
      ...rows.map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 2}">${labels.map((item, columnIndex) => cell(row[item.key] ?? null, columnIndex + 1, rowIndex + 2)).join('')}</row>`,
      ),
    ].join('');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${Math.max(1, rows.length + 1)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${labels.map((item, index) => `<col min="${index + 1}" max="${index + 1}" width="${item.width}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(1, rows.length + 1)}"/></worksheet>`;
    const files: Record<string, Uint8Array> = {
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
      ),
      'xl/workbook.xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      ),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
      'xl/styles.xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFA8687D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>',
      ),
      'docProps/core.xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Dear Angel Nail Studio</dc:creator><dc:title>${xml(sheetName)}</dc:title></cp:coreProperties>`,
      ),
    };
    return Buffer.from(zipSync(files, { level: 6 }));
  }

  private columnLetter(column: number) {
    let result = '';
    while (column > 0) {
      column -= 1;
      result = String.fromCharCode(65 + (column % 26)) + result;
      column = Math.floor(column / 26);
    }
    return result;
  }

  private appointmentStatus(value: string) {
    if (!Object.values(AppointmentStatusValue).includes(value as AppointmentStatus)) {
      throw new BadRequestException('El estado de cita no es válido.');
    }
    return value as AppointmentStatus;
  }

  private depositStatus(value: string) {
    if (!Object.values(DepositStatusValue).includes(value as DepositStatusValue)) {
      throw new BadRequestException('El estado de anticipo no es válido.');
    }
    return value as DepositStatusValue;
  }
}
