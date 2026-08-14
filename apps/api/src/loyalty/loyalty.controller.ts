import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import {
  ClientSearchDto,
  IssuePromotionDto,
  PromotionDto,
  RedeemCouponDto,
  RewardRuleDto,
  VisitCorrectionDto,
} from './loyalty.dto';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Roles(UserRole.CLIENT)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.loyalty.myProfile(user);
  }

  @Roles(UserRole.ADMIN, UserRole.NAIL_TECHNICIAN)
  @Get('clients')
  clients(@Query() query: ClientSearchDto) {
    return this.loyalty.listClients(query);
  }

  @Roles(UserRole.ADMIN, UserRole.NAIL_TECHNICIAN)
  @Get('clients/:id')
  client(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loyalty.clientProfile(user, id);
  }

  @Roles(UserRole.ADMIN)
  @Post('clients/:id/visits/correction')
  correctVisits(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VisitCorrectionDto,
    @Req() request: Request,
  ) {
    return this.loyalty.correctVisits(user, id, dto, request);
  }

  @Roles(UserRole.ADMIN, UserRole.NAIL_TECHNICIAN)
  @Post('coupons/:id/redeem')
  redeem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedeemCouponDto,
    @Req() request: Request,
  ) {
    return this.loyalty.redeem(user, id, dto.appointmentId, request);
  }

  @Roles(UserRole.ADMIN)
  @Post('coupons/:id/reverse')
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.loyalty.reverse(user, id, request);
  }
}

@Controller('admin/loyalty')
@Roles(UserRole.ADMIN)
export class AdminLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get()
  configuration() {
    return this.loyalty.configuration();
  }

  @Post('rules')
  createRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RewardRuleDto,
    @Req() request: Request,
  ) {
    return this.loyalty.createRule(user, dto, request);
  }

  @Put('rules/:id')
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RewardRuleDto,
    @Req() request: Request,
  ) {
    return this.loyalty.updateRule(user, id, dto, request);
  }

  @Post('promotions')
  createPromotion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PromotionDto,
    @Req() request: Request,
  ) {
    return this.loyalty.createPromotion(user, dto, request);
  }

  @Put('promotions/:id')
  updatePromotion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromotionDto,
    @Req() request: Request,
  ) {
    return this.loyalty.updatePromotion(user, id, dto, request);
  }

  @Patch('promotions/:id/issue')
  issuePromotion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssuePromotionDto,
    @Req() request: Request,
  ) {
    return this.loyalty.issuePromotion(user, id, dto.clientId, request);
  }
}
