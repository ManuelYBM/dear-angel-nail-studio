import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { AuthenticatedUser } from '../common/auth.types';
import { requestIp } from '../common/request-meta';
import { PrismaService } from '../infrastructure/prisma.service';
import { StorageService } from '../infrastructure/storage.service';
import { AuditService } from '../identity/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AssignQuoteDto,
  CalculatorOptionDto,
  CatalogDesignDto,
  CatalogQueryDto,
  CreateQuoteDto,
  ReviewQuoteDto,
} from './catalog.dto';
import { canTechnicianAccessQuote } from './quote-access';

type CatalogListQuery = CatalogQueryDto & { limit?: number };

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async listDesigns(user: AuthenticatedUser | undefined, query: CatalogListQuery, admin = false) {
    const designs = await this.prisma.catalogDesign.findMany({
      where: {
        ...(admin ? {} : { published: true }),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.technique ? { technique: query.technique } : {}),
        ...(query.category ? { categories: { has: query.category } } : {}),
        ...(query.favorites && user ? { favorites: { some: { userId: user.id } } } : {}),
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        ...(user ? { favorites: { where: { userId: user.id } } } : {}),
      },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      ...(query.limit ? { take: query.limit } : {}),
    });
    return {
      items: designs.map((design) => ({
        ...design,
        favorite: 'favorites' in design ? design.favorites.length > 0 : false,
        favorites: undefined,
      })),
    };
  }

  async getDesign(id: string) {
    const design = await this.prisma.catalogDesign.findFirst({
      where: { id, published: true },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!design) throw new NotFoundException('No encontramos este diseño.');
    return { design };
  }

  async createDesign(actor: AuthenticatedUser, dto: CatalogDesignDto, request: Request) {
    const design = await this.prisma.catalogDesign.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        description: dto.description.trim(),
        technique: dto.technique.trim(),
        nailLength: dto.nailLength?.trim() || null,
        categories: this.cleanTags(dto.categories),
        createdByUserId: actor.id,
      },
      include: { images: true },
    });
    await this.record(actor, request, 'CATALOG_DESIGN_CREATED', 'CatalogDesign', design.id);
    return { design };
  }

  async updateDesign(
    actor: AuthenticatedUser,
    id: string,
    dto: CatalogDesignDto,
    request: Request,
  ) {
    await this.requireDesign(id, true);
    const design = await this.prisma.catalogDesign.update({
      where: { id },
      data: {
        ...dto,
        title: dto.title.trim(),
        description: dto.description.trim(),
        technique: dto.technique.trim(),
        nailLength: dto.nailLength?.trim() || null,
        categories: this.cleanTags(dto.categories),
      },
      include: { images: true },
    });
    await this.record(actor, request, 'CATALOG_DESIGN_UPDATED', 'CatalogDesign', id);
    return { design };
  }

  async deleteDesign(actor: AuthenticatedUser, id: string, request: Request) {
    const design = await this.prisma.catalogDesign.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!design) throw new NotFoundException('No encontramos este diseño.');
    await this.prisma.catalogDesign.delete({ where: { id } });
    await Promise.all(
      design.images.map((image) =>
        this.storage.removeObject(image.objectKey).catch(() => undefined),
      ),
    );
    await this.record(actor, request, 'CATALOG_DESIGN_DELETED', 'CatalogDesign', id);
    return { deleted: true };
  }

  async uploadDesignImage(
    actor: AuthenticatedUser,
    designId: string,
    file: UploadedAsset,
    request: Request,
  ) {
    await this.requireDesign(designId, true);
    this.assertImage(file);
    const count = await this.prisma.catalogDesignImage.count({ where: { designId } });
    if (count >= 5) throw new BadRequestException('Cada diseño admite hasta 5 imágenes.');
    const objectKey = `catalog/${designId}/${randomUUID()}-${this.safeFilename(file.originalname)}`;
    await this.storage.putObject(objectKey, file.buffer, file.mimetype);
    try {
      const image = await this.prisma.catalogDesignImage.create({
        data: {
          designId,
          objectKey,
          mimeType: file.mimetype,
          filename: file.originalname,
          sizeBytes: file.size,
          sortOrder: count,
        },
      });
      await this.record(actor, request, 'CATALOG_IMAGE_UPLOADED', 'CatalogDesignImage', image.id);
      return { image };
    } catch (error) {
      await this.storage.removeObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteDesignImage(actor: AuthenticatedUser, imageId: string, request: Request) {
    const image = await this.prisma.catalogDesignImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('No encontramos la imagen.');
    await this.prisma.catalogDesignImage.delete({ where: { id: imageId } });
    await this.storage.removeObject(image.objectKey).catch(() => undefined);
    await this.record(actor, request, 'CATALOG_IMAGE_DELETED', 'CatalogDesignImage', imageId);
    return { deleted: true };
  }

  async setDesignCover(actor: AuthenticatedUser, imageId: string, request: Request) {
    const image = await this.prisma.catalogDesignImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('No encontramos la imagen.');
    const design = await this.prisma.$transaction(async (tx) => {
      await tx.catalogDesignImage.updateMany({
        where: { designId: image.designId },
        data: { sortOrder: { increment: 1 } },
      });
      await tx.catalogDesignImage.update({ where: { id: imageId }, data: { sortOrder: 0 } });
      return tx.catalogDesign.findUniqueOrThrow({
        where: { id: image.designId },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    await this.record(actor, request, 'CATALOG_COVER_UPDATED', 'CatalogDesignImage', imageId);
    return { design };
  }

  async catalogImage(imageId: string): Promise<StoredAsset> {
    const image = await this.prisma.catalogDesignImage.findFirst({
      where: { id: imageId, design: { published: true } },
    });
    if (!image) throw new NotFoundException('No encontramos la imagen.');
    return {
      stream: await this.storage.getObject(image.objectKey),
      mimeType: image.mimeType,
      filename: image.filename,
    };
  }

  async toggleFavorite(user: AuthenticatedUser, designId: string) {
    await this.requireDesign(designId, false);
    const key = { userId_designId: { userId: user.id, designId } };
    const existing = await this.prisma.catalogFavorite.findUnique({ where: key });
    if (existing) await this.prisma.catalogFavorite.delete({ where: key });
    else await this.prisma.catalogFavorite.create({ data: { userId: user.id, designId } });
    return { favorite: !existing };
  }

  async calculator(admin = false) {
    return {
      items: await this.prisma.calculatorOption.findMany({
        where: admin ? {} : { active: true },
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    };
  }

  async createOption(actor: AuthenticatedUser, dto: CalculatorOptionDto, request: Request) {
    await this.assertParent(dto.parentOptionId);
    const option = await this.prisma.calculatorOption.create({ data: this.optionData(dto) });
    await this.record(actor, request, 'CALCULATOR_OPTION_CREATED', 'CalculatorOption', option.id);
    return { option };
  }

  async updateOption(
    actor: AuthenticatedUser,
    id: string,
    dto: CalculatorOptionDto,
    request: Request,
  ) {
    if (dto.parentOptionId === id)
      throw new BadRequestException('Una opción no puede depender de sí misma.');
    await this.assertParent(dto.parentOptionId);
    const option = await this.prisma.calculatorOption.update({
      where: { id },
      data: this.optionData(dto),
    });
    await this.record(actor, request, 'CALCULATOR_OPTION_UPDATED', 'CalculatorOption', option.id);
    return { option };
  }

  async uploadOptionIcon(
    actor: AuthenticatedUser,
    id: string,
    file: UploadedAsset,
    request: Request,
  ) {
    const current = await this.prisma.calculatorOption.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('No encontramos la opción.');
    this.assertImage(file);
    const objectKey = `calculator/${id}/${randomUUID()}-${this.safeFilename(file.originalname)}`;
    await this.storage.putObject(objectKey, file.buffer, file.mimetype);
    const option = await this.prisma.calculatorOption.update({
      where: { id },
      data: { iconObjectKey: objectKey, iconMimeType: file.mimetype },
    });
    if (current.iconObjectKey)
      await this.storage.removeObject(current.iconObjectKey).catch(() => undefined);
    await this.record(actor, request, 'CALCULATOR_ICON_UPLOADED', 'CalculatorOption', id);
    return { option };
  }

  async optionIcon(id: string): Promise<StoredAsset> {
    const option = await this.prisma.calculatorOption.findFirst({ where: { id, active: true } });
    if (!option?.iconObjectKey || !option.iconMimeType)
      throw new NotFoundException('Esta opción no tiene icono cargado.');
    return {
      stream: await this.storage.getObject(option.iconObjectKey),
      mimeType: option.iconMimeType,
      filename: `${option.code}-icon`,
    };
  }

  async createQuote(user: AuthenticatedUser, dto: CreateQuoteDto, request: Request) {
    if (dto.preferredTechnicianId) await this.requireTechnician(dto.preferredTechnicianId);
    const grouped = new Map<string, number>();
    for (const selection of dto.selections)
      grouped.set(selection.optionId, (grouped.get(selection.optionId) ?? 0) + selection.quantity);
    if (!dto.noDesign && grouped.size === 0)
      throw new BadRequestException({
        code: 'QUOTE_SELECTION_REQUIRED',
        message: 'Selecciona una técnica o usa “No tengo diseño”.',
      });
    const options = await this.prisma.calculatorOption.findMany({
      where: { id: { in: [...grouped.keys()] }, active: true },
    });
    if (options.length !== grouped.size)
      throw new BadRequestException('Una opción ya no está disponible.');
    let estimatedPriceCents = 0;
    let estimatedDurationMinutes = 0;
    const breakdown: Array<{
      optionId: string;
      name: string;
      quantity: number;
      amountCents: number;
    }> = [];
    const selections: Prisma.QuoteSelectionCreateWithoutQuoteInput[] = [];
    for (const option of options) {
      const quantity = grouped.get(option.id) ?? 1;
      if (quantity > option.maxQuantity)
        throw new BadRequestException(`${option.name} permite máximo ${option.maxQuantity}.`);
      const multiplier = option.pricingMode === 'PER_UNIT' ? quantity : 1;
      const amountCents = option.priceCents * multiplier;
      estimatedPriceCents += amountCents;
      estimatedDurationMinutes += option.durationMinutes * multiplier;
      breakdown.push({ optionId: option.id, name: option.name, quantity, amountCents });
      selections.push({
        option: { connect: { id: option.id } },
        quantity,
        unitPriceCents: option.priceCents,
        optionName: option.name,
      });
    }
    const quote = await this.prisma.customQuote.create({
      data: {
        clientId: user.id,
        preferredTechnicianId: dto.preferredTechnicianId,
        status: 'PENDING_REVIEW',
        noDesign: dto.noDesign,
        estimatedPriceCents,
        estimatedDurationMinutes: Math.max(estimatedDurationMinutes, 60),
        clientNotes: dto.clientNotes?.trim() || null,
        priceBreakdown: breakdown,
        selections: { create: selections },
      },
      include: this.quoteInclude,
    });
    await this.record(user, request, 'CUSTOM_QUOTE_CREATED', 'CustomQuote', quote.id);
    const reviewers = dto.preferredTechnicianId
      ? [dto.preferredTechnicianId]
      : (
          await this.prisma.user.findMany({
            where: {
              role: 'NAIL_TECHNICIAN',
              status: 'ACTIVE',
              technicianSchedule: { acceptingBookings: true },
            },
            select: { id: true },
          })
        ).map(({ id }) => id);
    await this.notifications
      .notifyMany(reviewers, {
        kind: 'QUOTE',
        title: 'Nueva cotización por revisar',
        body: `${user.fullName} envió una idea personalizada.`,
        actionUrl: '/cotizaciones',
        templateKey: 'quote_update',
        dedupePrefix: `quote-created:${quote.id}`,
        external: true,
      })
      .catch(() => null);
    return { quote: this.safeQuote(quote, user) };
  }

  async uploadQuoteImage(
    user: AuthenticatedUser,
    quoteId: string,
    file: UploadedAsset,
    request: Request,
  ) {
    this.assertImage(file);
    const quote = await this.prisma.customQuote.findUnique({
      where: { id: quoteId },
      include: { _count: { select: { images: true } } },
    });
    if (!quote) throw new NotFoundException('No encontramos la cotización.');
    if (user.role === 'CLIENT' && quote.clientId !== user.id) throw new ForbiddenException();
    if (user.role === 'NAIL_TECHNICIAN' && quote.assignedTechnicianId !== user.id)
      throw new ForbiddenException();
    if (quote._count.images >= 5) throw new BadRequestException('Puedes subir hasta 5 imágenes.');
    if (!['PENDING_REVIEW', 'IN_REVIEW'].includes(quote.status))
      throw new ConflictException('Esta cotización ya fue revisada.');
    const objectKey = `quotes/${quoteId}/${randomUUID()}-${this.safeFilename(file.originalname)}`;
    await this.storage.putObject(objectKey, file.buffer, file.mimetype);
    try {
      const image = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.customQuote.updateMany({
          where: {
            id: quoteId,
            status: { in: ['PENDING_REVIEW', 'IN_REVIEW'] },
            updatedAt: quote.updatedAt,
            ...(user.role === 'CLIENT'
              ? { clientId: user.id }
              : user.role === 'NAIL_TECHNICIAN'
                ? { assignedTechnicianId: user.id }
                : {}),
          },
          data: {
            updatedAt: new Date(Math.max(Date.now(), quote.updatedAt.getTime() + 1)),
          },
        });
        if (locked.count !== 1) {
          throw new ConflictException('La cotización cambió mientras se cargaba la imagen.');
        }
        const imageCount = await tx.quoteImage.count({ where: { quoteId } });
        if (imageCount >= 5) throw new BadRequestException('Puedes subir hasta 5 imágenes.');
        return tx.quoteImage.create({
          data: {
            quoteId,
            objectKey,
            mimeType: file.mimetype,
            filename: file.originalname,
            sizeBytes: file.size,
            sortOrder: imageCount,
          },
        });
      });
      await this.record(user, request, 'QUOTE_IMAGE_UPLOADED', 'QuoteImage', image.id);
      return { image };
    } catch (error) {
      await this.storage.removeObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async quoteImage(user: AuthenticatedUser, imageId: string): Promise<StoredAsset> {
    const image = await this.prisma.quoteImage.findUnique({
      where: { id: imageId },
      include: { quote: true },
    });
    if (!image) throw new NotFoundException('No encontramos la imagen.');
    this.assertQuoteAccess(user, image.quote);
    return {
      stream: await this.storage.getObject(image.objectKey),
      mimeType: image.mimeType,
      filename: image.filename,
    };
  }

  async listQuotes(user: AuthenticatedUser) {
    const where: Prisma.CustomQuoteWhereInput =
      user.role === 'CLIENT'
        ? { clientId: user.id }
        : user.role === 'NAIL_TECHNICIAN'
          ? {
              OR: [
                { assignedTechnicianId: user.id },
                {
                  status: 'PENDING_REVIEW',
                  assignedTechnicianId: null,
                  preferredTechnicianId: user.id,
                },
                {
                  status: 'PENDING_REVIEW',
                  assignedTechnicianId: null,
                  preferredTechnicianId: null,
                },
              ],
            }
          : {};
    const items = await this.prisma.customQuote.findMany({
      where,
      include: this.quoteInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { items: items.map((quote) => this.safeQuote(quote, user)) };
  }

  getQuote(user: AuthenticatedUser, id: string) {
    return this.getQuoteForUser(user, id);
  }

  async claimQuote(user: AuthenticatedUser, id: string, request: Request) {
    await this.requireTechnician(user.id);
    const available = await this.prisma.customQuote.findFirst({
      where: {
        id,
        status: 'PENDING_REVIEW',
        assignedTechnicianId: null,
        OR: [{ preferredTechnicianId: null }, { preferredTechnicianId: user.id }],
      },
    });
    if (!available)
      throw new ConflictException({
        code: 'QUOTE_ALREADY_CLAIMED',
        message: 'Esta cotización ya fue tomada o no está dirigida a ti.',
      });
    const result = await this.prisma.customQuote.updateMany({
      where: {
        id,
        status: 'PENDING_REVIEW',
        assignedTechnicianId: null,
        updatedAt: available.updatedAt,
        OR: [{ preferredTechnicianId: null }, { preferredTechnicianId: user.id }],
      },
      data: { assignedTechnicianId: user.id, status: 'IN_REVIEW', claimedAt: new Date() },
    });
    if (result.count !== 1)
      throw new ConflictException({
        code: 'QUOTE_ALREADY_CLAIMED',
        message: 'Otra manicurista tomó esta solicitud primero.',
      });
    await this.record(user, request, 'CUSTOM_QUOTE_CLAIMED', 'CustomQuote', id);
    await this.notifications
      .notify({
        userId: available.clientId,
        kind: 'QUOTE',
        title: 'Tu cotización ya está en revisión',
        body: `${user.fullName} comenzó a revisar tu diseño.`,
        actionUrl: '/cotizaciones',
        templateKey: 'quote_update',
        dedupeKey: `quote-claimed:${id}:client`,
        external: true,
      })
      .catch(() => null);
    return this.getQuoteForUser(user, id);
  }

  async assignQuote(user: AuthenticatedUser, id: string, dto: AssignQuoteDto, request: Request) {
    await this.requireTechnician(dto.technicianId);
    const current = await this.prisma.customQuote.findUnique({
      where: { id },
      include: {
        appointments: { where: { status: { in: ['HELD', 'PENDING_PAYMENT', 'CONFIRMED'] } } },
      },
    });
    if (!current) throw new NotFoundException('No encontramos la cotización.');
    if (!['PENDING_REVIEW', 'IN_REVIEW'].includes(current.status) || current.appointments.length) {
      throw new ConflictException('La cotización ya no puede reasignarse.');
    }
    const changed = await this.prisma.customQuote.updateMany({
      where: {
        id,
        status: { in: ['PENDING_REVIEW', 'IN_REVIEW'] },
        updatedAt: current.updatedAt,
        assignedTechnicianId: current.assignedTechnicianId,
      },
      data: { assignedTechnicianId: dto.technicianId, status: 'IN_REVIEW', claimedAt: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('La cotización acaba de cambiar.');
    const quote = await this.prisma.customQuote.findUniqueOrThrow({
      where: { id },
      include: this.quoteInclude,
    });
    await this.record(user, request, 'CUSTOM_QUOTE_ASSIGNED', 'CustomQuote', id);
    await this.notifications
      .notify({
        userId: dto.technicianId,
        kind: 'QUOTE',
        title: 'Te asignaron una cotización',
        body: `${quote.client.fullName} espera la revisión de su diseño.`,
        actionUrl: '/cotizaciones',
        templateKey: 'quote_update',
        dedupeKey: `quote-assigned:${id}:${dto.technicianId}`,
        external: true,
      })
      .catch(() => null);
    return { quote: this.safeQuote(quote, user) };
  }

  async reviewQuote(user: AuthenticatedUser, id: string, dto: ReviewQuoteDto, request: Request) {
    if (!['APPROVED', 'REJECTED'].includes(dto.status))
      throw new BadRequestException('La revisión debe aprobar o rechazar la solicitud.');
    const quote = await this.prisma.customQuote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException('No encontramos la cotización.');
    if (quote.status !== 'IN_REVIEW')
      throw new ConflictException('La cotización no está pendiente de revisión.');
    if (user.role === 'NAIL_TECHNICIAN' && quote.assignedTechnicianId !== user.id)
      throw new ForbiddenException('Esta cotización pertenece a otra manicurista.');
    if (user.role === 'ADMIN' && dto.status === 'APPROVED' && !quote.assignedTechnicianId)
      throw new BadRequestException('Asigna una manicurista antes de aprobar.');
    if (
      dto.status === 'APPROVED' &&
      (dto.confirmedPriceCents === undefined || dto.confirmedDurationMinutes === undefined)
    )
      throw new BadRequestException('Confirma precio y duración.');
    if (dto.status === 'APPROVED' && quote.assignedTechnicianId) {
      await this.requireTechnician(quote.assignedTechnicianId);
    }
    const changed = await this.prisma.customQuote.updateMany({
      where: {
        id,
        status: 'IN_REVIEW',
        updatedAt: quote.updatedAt,
        assignedTechnicianId: quote.assignedTechnicianId,
      },
      data: {
        status: dto.status,
        assignedTechnicianId:
          quote.assignedTechnicianId ?? (user.role === 'NAIL_TECHNICIAN' ? user.id : undefined),
        reviewedByUserId: user.id,
        confirmedPriceCents: dto.status === 'APPROVED' ? dto.confirmedPriceCents : null,
        confirmedDurationMinutes: dto.status === 'APPROVED' ? dto.confirmedDurationMinutes : null,
        reviewerComments: dto.reviewerComments?.trim() || null,
        reviewedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new ConflictException('La cotización acaba de cambiar.');
    const reviewed = await this.prisma.customQuote.findUniqueOrThrow({
      where: { id },
      include: this.quoteInclude,
    });
    await this.record(user, request, `CUSTOM_QUOTE_${dto.status}`, 'CustomQuote', id);
    await this.notifications
      .notify({
        userId: reviewed.clientId,
        kind: 'QUOTE',
        title:
          dto.status === 'APPROVED' ? 'Tu cotización está lista' : 'Tu cotización necesita cambios',
        body:
          dto.status === 'APPROVED'
            ? 'Ya confirmamos el precio y el tiempo. Ahora puedes elegir un horario.'
            : reviewed.reviewerComments || 'Revisa los comentarios de la manicurista.',
        actionUrl: '/cotizaciones',
        templateKey: 'quote_update',
        dedupeKey: `quote-reviewed:${id}:${reviewed.updatedAt.toISOString()}`,
        external: true,
      })
      .catch(() => null);
    return { quote: this.safeQuote(reviewed, user) };
  }

  async cancelQuote(user: AuthenticatedUser, id: string, request: Request) {
    const quote = await this.prisma.customQuote.findUnique({
      where: { id },
      include: {
        appointments: { where: { status: { in: ['HELD', 'PENDING_PAYMENT', 'CONFIRMED'] } } },
      },
    });
    if (!quote) throw new NotFoundException('No encontramos la cotización.');
    if (quote.clientId !== user.id) throw new ForbiddenException();
    if (!['PENDING_REVIEW', 'IN_REVIEW'].includes(quote.status) || quote.appointments.length) {
      throw new ConflictException('La cotización ya no puede cancelarse.');
    }
    const changed = await this.prisma.customQuote.updateMany({
      where: {
        id,
        clientId: user.id,
        status: { in: ['PENDING_REVIEW', 'IN_REVIEW'] },
        updatedAt: quote.updatedAt,
        assignedTechnicianId: quote.assignedTechnicianId,
        preferredTechnicianId: quote.preferredTechnicianId,
      },
      data: { status: 'CANCELLED' },
    });
    if (changed.count !== 1) throw new ConflictException('La cotización acaba de cambiar.');
    await this.record(user, request, 'CUSTOM_QUOTE_CANCELLED', 'CustomQuote', id);
    const reviewers = quote.assignedTechnicianId
      ? [quote.assignedTechnicianId]
      : quote.preferredTechnicianId
        ? [quote.preferredTechnicianId]
        : [];
    if (reviewers.length) {
      await this.notifications
        .notifyMany(reviewers, {
          kind: 'QUOTE',
          title: 'Cotización cancelada',
          body: `${user.fullName} canceló su solicitud de cotización.`,
          actionUrl: '/cotizaciones',
          templateKey: 'quote_update',
          dedupePrefix: `quote-cancelled:${id}`,
          external: false,
        })
        .catch(() => null);
    }
    return this.getQuoteForUser(user, id);
  }

  private async getQuoteForUser(user: AuthenticatedUser, id: string) {
    const quote = await this.prisma.customQuote.findUnique({
      where: { id },
      include: this.quoteInclude,
    });
    if (!quote) throw new NotFoundException('No encontramos la cotización.');
    this.assertQuoteAccess(user, quote);
    return { quote: this.safeQuote(quote, user) };
  }

  private assertQuoteAccess(
    user: AuthenticatedUser,
    quote: {
      clientId: string;
      assignedTechnicianId: string | null;
      preferredTechnicianId: string | null;
      status: string;
    },
  ) {
    if (user.role === 'ADMIN') return;
    if (user.role === 'CLIENT') {
      if (quote.clientId !== user.id) throw new ForbiddenException();
      return;
    }
    if (!canTechnicianAccessQuote(user.id, quote)) throw new ForbiddenException();
  }

  private optionData(dto: CalculatorOptionDto): Prisma.CalculatorOptionUncheckedCreateInput {
    return {
      ...dto,
      code: dto.code.trim().toLowerCase(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      iconText: dto.iconText?.trim() || null,
      parentOptionId: dto.parentOptionId || null,
    };
  }

  private async assertParent(id?: string) {
    if (!id) return;
    if (!(await this.prisma.calculatorOption.findUnique({ where: { id } })))
      throw new BadRequestException('La opción principal no existe.');
  }

  private requireTechnician(id: string) {
    return this.prisma.user
      .findFirstOrThrow({
        where: {
          id,
          role: 'NAIL_TECHNICIAN',
          status: 'ACTIVE',
          technicianSchedule: { acceptingBookings: true },
        },
      })
      .catch(() => {
        throw new BadRequestException('Selecciona una manicurista activa.');
      });
  }

  private async requireDesign(id: string, admin: boolean) {
    const design = await this.prisma.catalogDesign.findFirst({
      where: { id, ...(admin ? {} : { published: true }) },
    });
    if (!design) throw new NotFoundException('No encontramos este diseño.');
    return design;
  }

  private cleanTags(tags: string[]) {
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  }

  private record(
    actor: AuthenticatedUser,
    request: Request,
    action: string,
    entityType: string,
    entityId: string,
  ) {
    return this.audit.record({
      actorUserId: actor.id,
      action,
      entityType,
      entityId,
      ipAddress: requestIp(request),
    });
  }

  private safeQuote(quote: Record<string, unknown>, user: AuthenticatedUser) {
    if (
      user.role === 'NAIL_TECHNICIAN' &&
      quote.assignedTechnicianId !== user.id &&
      quote.client &&
      typeof quote.client === 'object'
    ) {
      return {
        ...quote,
        client: { ...quote.client, phone: null, email: null },
      };
    }
    return quote;
  }

  private readonly quoteInclude = {
    client: { select: { id: true, fullName: true, phone: true } },
    preferredTechnician: { select: { id: true, fullName: true } },
    assignedTechnician: { select: { id: true, fullName: true } },
    reviewedBy: { select: { id: true, fullName: true } },
    selections: { orderBy: { createdAt: 'asc' as const } },
    images: { orderBy: { sortOrder: 'asc' as const } },
  };

  private assertImage(file?: UploadedAsset) {
    if (!file) throw new BadRequestException('Selecciona una imagen.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new BadRequestException('Usa una imagen JPG, PNG o WebP.');
    if (file.size > 8 * 1024 * 1024)
      throw new BadRequestException('La imagen no puede superar 8 MB.');
  }

  private safeFilename(filename: string) {
    return (
      filename
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .slice(-120) || 'imagen'
    );
  }
}

export interface UploadedAsset {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface StoredAsset {
  stream: Readable;
  mimeType: string;
  filename: string;
}
