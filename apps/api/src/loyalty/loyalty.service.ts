import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../common/auth.types';
import { requestIp } from '../common/request-meta';
import { PrismaService } from '../infrastructure/prisma.service';
import { AuditService } from '../identity/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  ClientSearchDto,
  PromotionDto,
  RewardRuleDto,
  VisitCorrectionDto,
} from './loyalty.dto';
import { canRedeemOnAppointment, totalVisits } from './loyalty.rules';

type DatabaseClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async myProfile(user: AuthenticatedUser) {
    if (user.role !== 'CLIENT') throw new ForbiddenException('Esta vista pertenece a clientas.');
    return this.profile(user.id);
  }

  async clientProfile(actor: AuthenticatedUser, clientId: string) {
    if (actor.role === 'CLIENT' && actor.id !== clientId) {
      throw new ForbiddenException('No puedes consultar recompensas de otra clienta.');
    }
    return this.profile(clientId);
  }

  async listClients(query: ClientSearchDto) {
    const clients = await this.prisma.user.findMany({
      where: {
        role: 'CLIENT',
        status: { not: 'ARCHIVED' },
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' as const } },
                { phone: { contains: query.search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        visitEntries: { select: { delta: true } },
        rewardCoupons: { where: { status: 'AVAILABLE' }, select: { id: true } },
      },
      orderBy: { fullName: 'asc' },
      take: 100,
    });
    return {
      items: clients.map((client) => ({
        id: client.id,
        fullName: client.fullName,
        phone: client.phone,
        visitCount: totalVisits(client.visitEntries),
        availableCouponCount: client.rewardCoupons.length,
      })),
    };
  }

  async configuration() {
    const [rules, promotions] = await this.prisma.$transaction([
      this.prisma.rewardRule.findMany({ orderBy: { visitNumber: 'asc' } }),
      this.prisma.promotion.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }),
    ]);
    return { rules, promotions };
  }

  async createRule(actor: AuthenticatedUser, dto: RewardRuleDto, request: Request) {
    try {
      const rule = await this.prisma.rewardRule.create({
        data: { ...dto, createdByUserId: actor.id },
      });
      await this.issueRuleToEligibleClients(rule.id, actor.id);
      await this.record(actor, request, 'REWARD_RULE_CREATED', 'RewardRule', rule.id, {
        visitNumber: rule.visitNumber,
      });
      return { rule };
    } catch (error) {
      this.rethrowUnique(error, 'Ya existe una recompensa para ese número de visita.');
    }
  }

  async updateRule(actor: AuthenticatedUser, ruleId: string, dto: RewardRuleDto, request: Request) {
    await this.findRule(ruleId);
    try {
      const rule = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.rewardRule.update({ where: { id: ruleId }, data: dto });
        await tx.clientCoupon.updateMany({
          where: { rewardRuleId: ruleId, status: 'AVAILABLE' },
          data: { title: dto.title, description: dto.description, iconText: dto.iconText },
        });
        return updated;
      });
      await this.reconcileRuleEligibility(rule.id, actor.id);
      await this.record(actor, request, 'REWARD_RULE_UPDATED', 'RewardRule', rule.id, {
        visitNumber: rule.visitNumber,
        active: rule.active,
      });
      return { rule };
    } catch (error) {
      this.rethrowUnique(error, 'Ya existe una recompensa para ese número de visita.');
    }
  }

  async createPromotion(actor: AuthenticatedUser, dto: PromotionDto, request: Request) {
    try {
      const promotion = await this.prisma.promotion.create({
        data: { ...dto, createdByUserId: actor.id },
      });
      await this.record(actor, request, 'PROMOTION_CREATED', 'Promotion', promotion.id, {
        code: promotion.code,
      });
      return { promotion };
    } catch (error) {
      this.rethrowUnique(error, 'Ese código promocional ya existe.');
    }
  }

  async updatePromotion(
    actor: AuthenticatedUser,
    promotionId: string,
    dto: PromotionDto,
    request: Request,
  ) {
    await this.findPromotion(promotionId);
    try {
      const promotion = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.promotion.update({ where: { id: promotionId }, data: dto });
        await tx.clientCoupon.updateMany({
          where: { promotionId, status: 'AVAILABLE' },
          data: { title: dto.title, description: dto.description, iconText: dto.iconText },
        });
        return updated;
      });
      await this.record(actor, request, 'PROMOTION_UPDATED', 'Promotion', promotion.id, {
        code: promotion.code,
        active: promotion.active,
      });
      return { promotion };
    } catch (error) {
      this.rethrowUnique(error, 'Ese código promocional ya existe.');
    }
  }

  async issuePromotion(
    actor: AuthenticatedUser,
    promotionId: string,
    clientId: string,
    request: Request,
  ) {
    const [promotion] = await Promise.all([
      this.findPromotion(promotionId),
      this.findClient(clientId),
    ]);
    if (!promotion.active) throw new ConflictException('Esta promoción está desactivada.');
    try {
      const coupon = await this.prisma.clientCoupon.create({
        data: {
          clientId,
          promotionId,
          source: 'PROMOTION',
          title: promotion.title,
          description: promotion.description,
          iconText: promotion.iconText,
          issuedByUserId: actor.id,
        },
      });
      await this.record(actor, request, 'PROMOTION_ISSUED', 'ClientCoupon', coupon.id, {
        clientId,
        promotionId,
      });
      await this.notifications
        .notify({
          userId: clientId,
          kind: 'COUPON',
          title: 'Tienes un cupón nuevo',
          body: `${coupon.title}: ${coupon.description}`,
          actionUrl: '/recompensas',
          templateKey: 'coupon_unlocked',
          dedupeKey: `coupon-issued:${coupon.id}`,
          external: true,
        })
        .catch(() => null);
      return { coupon };
    } catch (error) {
      this.rethrowUnique(error, 'Esta clienta ya recibió esa promoción.');
    }
  }

  async correctVisits(
    actor: AuthenticatedUser,
    clientId: string,
    dto: VisitCorrectionDto,
    request: Request,
  ) {
    await this.findClient(clientId);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await this.visitCount(tx, clientId);
      const delta = dto.visitCount - current;
      if (delta === 0) {
        throw new ConflictException('El contador ya tiene ese número de visitas.');
      }
      const entry = await tx.clientVisitEntry.create({
        data: {
          clientId,
          delta,
          reason: 'ADMIN_CORRECTION',
          note: dto.note,
          createdByUserId: actor.id,
        },
      });
      await this.syncRewards(tx, clientId, actor.id, true);
      return { entry, previousCount: current, visitCount: dto.visitCount };
    });
    await this.record(
      actor,
      request,
      'CLIENT_VISITS_CORRECTED',
      'ClientVisitEntry',
      result.entry.id,
      {
        clientId,
        previousCount: result.previousCount,
        visitCount: result.visitCount,
        note: dto.note,
      },
    );
    return result;
  }

  async redeem(
    actor: AuthenticatedUser,
    couponId: string,
    appointmentId: string,
    request: Request,
  ) {
    try {
      const coupon = await this.prisma.$transaction(async (tx) => {
        const [current, appointment] = await Promise.all([
          tx.clientCoupon.findUnique({ where: { id: couponId } }),
          tx.appointment.findUnique({ where: { id: appointmentId } }),
        ]);
        if (!current) throw new NotFoundException('No encontramos ese cupón.');
        if (!appointment) throw new NotFoundException('No encontramos esa cita.');
        if (current.status !== 'AVAILABLE')
          throw new ConflictException('Este cupón ya fue utilizado.');
        if (!appointment.clientId || appointment.clientId !== current.clientId) {
          throw new BadRequestException('El cupón no pertenece a la clienta de esta cita.');
        }
        if (!canRedeemOnAppointment(appointment.status)) {
          throw new ConflictException(
            'El cupón solo puede usarse en una cita confirmada o atendida.',
          );
        }
        if (actor.role === 'NAIL_TECHNICIAN' && appointment.technicianId !== actor.id) {
          throw new ForbiddenException('Solo puedes canjear cupones en tus propias citas.');
        }
        const changed = await tx.clientCoupon.updateMany({
          where: { id: couponId, status: 'AVAILABLE' },
          data: {
            status: 'REDEEMED',
            redeemedAt: new Date(),
            redeemedByUserId: actor.id,
            redeemedAppointmentId: appointmentId,
          },
        });
        if (changed.count !== 1) throw new ConflictException('Este cupón acaba de utilizarse.');
        return tx.clientCoupon.findUniqueOrThrow({ where: { id: couponId } });
      });
      await this.record(actor, request, 'COUPON_REDEEMED', 'ClientCoupon', coupon.id, {
        clientId: coupon.clientId,
        appointmentId,
      });
      return { coupon };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'COUPON_COMBINATION_NOT_ALLOWED',
          message: 'Esta cita ya tiene un cupón utilizado. No pueden combinarse.',
        });
      }
      throw error;
    }
  }

  async reverse(actor: AuthenticatedUser, couponId: string, request: Request) {
    const current = await this.prisma.clientCoupon.findUnique({ where: { id: couponId } });
    if (!current) throw new NotFoundException('No encontramos ese cupón.');
    if (current.status !== 'REDEEMED') throw new ConflictException('Este cupón no está utilizado.');
    const appointmentId = current.redeemedAppointmentId;
    const coupon = await this.prisma.clientCoupon.update({
      where: { id: couponId },
      data: {
        status: 'AVAILABLE',
        redeemedAt: null,
        redeemedByUserId: null,
        redeemedAppointmentId: null,
      },
    });
    await this.record(actor, request, 'COUPON_REDEMPTION_REVERSED', 'ClientCoupon', coupon.id, {
      clientId: coupon.clientId,
      appointmentId,
    });
    return { coupon };
  }

  async registerCompletedAppointment(
    tx: Prisma.TransactionClient,
    appointment: { id: string; clientId: string | null },
    actorId: string,
  ) {
    if (!appointment.clientId) return;
    await tx.clientVisitEntry.create({
      data: {
        clientId: appointment.clientId,
        appointmentId: appointment.id,
        delta: 1,
        reason: 'APPOINTMENT_COMPLETED',
        createdByUserId: actorId,
      },
    });
    await this.syncRewards(tx, appointment.clientId, actorId);
  }

  private async profile(clientId: string) {
    const client = await this.prisma.user.findFirst({
      where: { id: clientId, role: 'CLIENT' },
      select: {
        id: true,
        fullName: true,
        phone: true,
        visitEntries: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            appointment: { select: { id: true, startAt: true } },
            createdBy: { select: { id: true, fullName: true } },
          },
        },
        rewardCoupons: {
          orderBy: { createdAt: 'desc' },
          include: {
            redeemedBy: { select: { id: true, fullName: true } },
            redeemedAppointment: { select: { id: true, startAt: true } },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('No encontramos esta clienta.');
    const rules = await this.prisma.rewardRule.findMany({
      where: { active: true },
      orderBy: { visitNumber: 'asc' },
    });
    const visitCount = totalVisits(client.visitEntries);
    const couponByRule = new Map(
      client.rewardCoupons
        .filter((coupon) => coupon.rewardRuleId)
        .map((coupon) => [coupon.rewardRuleId as string, coupon]),
    );
    return {
      client: { id: client.id, fullName: client.fullName, phone: client.phone },
      visitCount,
      availableCouponCount: client.rewardCoupons.filter((coupon) => coupon.status === 'AVAILABLE')
        .length,
      journey: rules.map((rule) => ({
        id: rule.id,
        visitNumber: rule.visitNumber,
        title: rule.title,
        description: rule.description,
        iconText: rule.iconText,
        state: couponByRule.get(rule.id)?.status ?? 'LOCKED',
        couponId: couponByRule.get(rule.id)?.id ?? null,
      })),
      coupons: client.rewardCoupons,
      visitHistory: client.visitEntries,
    };
  }

  private async syncRewards(
    db: DatabaseClient,
    clientId: string,
    issuedByUserId: string,
    removeIneligible = false,
  ) {
    const count = await this.visitCount(db, clientId);
    if (removeIneligible) {
      await db.clientCoupon.deleteMany({
        where: {
          clientId,
          source: 'VISIT_REWARD',
          status: 'AVAILABLE',
          rewardRule: { visitNumber: { gt: count } },
        },
      });
    }
    const rules = await db.rewardRule.findMany({
      where: { active: true, visitNumber: { lte: count } },
      orderBy: { visitNumber: 'asc' },
    });
    if (!rules.length) return;
    await db.clientCoupon.createMany({
      data: rules.map((rule) => ({
        clientId,
        rewardRuleId: rule.id,
        source: 'VISIT_REWARD' as const,
        title: rule.title,
        description: rule.description,
        iconText: rule.iconText,
        issuedByUserId,
      })),
      skipDuplicates: true,
    });
  }

  private async issueRuleToEligibleClients(ruleId: string, actorId: string) {
    const rule = await this.findRule(ruleId);
    if (!rule.active) return;
    const totals = await this.prisma.clientVisitEntry.groupBy({
      by: ['clientId'],
      _sum: { delta: true },
      having: { delta: { _sum: { gte: rule.visitNumber } } },
    });
    if (!totals.length) return;
    await this.prisma.clientCoupon.createMany({
      data: totals.map(({ clientId }) => ({
        clientId,
        rewardRuleId: rule.id,
        source: 'VISIT_REWARD' as const,
        title: rule.title,
        description: rule.description,
        iconText: rule.iconText,
        issuedByUserId: actorId,
      })),
      skipDuplicates: true,
    });
  }

  private async reconcileRuleEligibility(ruleId: string, actorId: string) {
    const rule = await this.findRule(ruleId);
    if (!rule.active) return;
    await this.issueRuleToEligibleClients(ruleId, actorId);
  }

  private async visitCount(db: DatabaseClient, clientId: string) {
    const aggregate = await db.clientVisitEntry.aggregate({
      where: { clientId },
      _sum: { delta: true },
    });
    return aggregate._sum.delta ?? 0;
  }

  private async findClient(clientId: string) {
    const client = await this.prisma.user.findFirst({ where: { id: clientId, role: 'CLIENT' } });
    if (!client) throw new NotFoundException('No encontramos esta clienta.');
    return client;
  }

  private async findRule(ruleId: string) {
    const rule = await this.prisma.rewardRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('No encontramos esa recompensa.');
    return rule;
  }

  private async findPromotion(promotionId: string) {
    const promotion = await this.prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!promotion) throw new NotFoundException('No encontramos esa promoción.');
    return promotion;
  }

  private async record(
    actor: AuthenticatedUser,
    request: Request,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await this.audit.record({
      actorUserId: actor.id,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress: requestIp(request),
    });
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
