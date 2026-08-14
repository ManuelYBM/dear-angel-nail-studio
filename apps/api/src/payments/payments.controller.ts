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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { CurrentUser, Public, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import {
  DepositListQueryDto,
  PaymentSettingsDto,
  ReceiptAcceptanceDto,
  ReviewDepositDto,
} from './payments.dto';
import { PaymentsService } from './payments.service';
import type { UploadedReceipt } from './payments.service';

const receiptUpload = FileInterceptor('receipt', {
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('settings')
  settings() {
    return this.payments.publicSettings();
  }

  @Public()
  @Get('policies')
  async policies() {
    const settings = await this.payments.publicSettings();
    return {
      policyVersion: settings.policyVersion,
      policyText: settings.policyText,
    };
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: DepositListQueryDto) {
    return this.payments.list(user, query);
  }

  @Get('appointments/:appointmentId')
  deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.payments.deposit(user, appointmentId);
  }

  @Roles(UserRole.CLIENT)
  @Post('appointments/:appointmentId/receipt')
  @UseInterceptors(receiptUpload)
  uploadReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @Body() dto: ReceiptAcceptanceDto,
    @UploadedFile() file: UploadedReceipt,
    @Req() request: Request,
  ) {
    return this.payments.uploadReceipt(user, appointmentId, dto, file, request);
  }

  @Get('appointments/:appointmentId/confirmation')
  confirmation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.payments.confirmation(user, appointmentId);
  }

  @Get(':depositId/receipt')
  async receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('depositId', ParseUUIDPipe) depositId: string,
    @Res() response: Response,
  ) {
    const receipt = await this.payments.receipt(user, depositId);
    response.setHeader('Content-Type', receipt.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${receipt.filename.replace(/["\r\n]/g, '')}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    receipt.stream.pipe(response);
  }
}

@Controller('admin/payments')
@Roles(UserRole.ADMIN)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('settings')
  settings() {
    return this.payments.configuration();
  }

  @Put('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PaymentSettingsDto,
    @Req() request: Request,
  ) {
    return this.payments.updateConfiguration(user, dto, request);
  }

  @Patch(':depositId/review')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('depositId', ParseUUIDPipe) depositId: string,
    @Body() dto: ReviewDepositDto,
    @Req() request: Request,
  ) {
    return this.payments.review(user, depositId, dto, request);
  }
}
