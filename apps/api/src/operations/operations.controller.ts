import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
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
import { requestIp } from '../common/request-meta';
import { AuditService } from '../identity/audit.service';
import {
  AppointmentReportQueryDto,
  AuditQueryDto,
  DepositReportQueryDto,
  ReportExportQueryDto,
  ReportRangeDto,
  StudioSettingsDto,
} from './operations.dto';
import { ReportsService } from './reports.service';
import type { ExportDataset, ExportFormat } from './reports.service';
import { StudioService } from './studio.service';
import type { BrandAsset, BrandUpload } from './studio.service';

const brandUpload = FileInterceptor('image', {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

@Controller('studio')
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  @Public()
  @Get('settings')
  settings() {
    return this.studio.publicSettings();
  }

  @Public()
  @Get('logo')
  async logo(@Res() response: Response) {
    this.sendAsset(response, await this.studio.asset('logo'));
  }

  @Public()
  @Get('icon')
  async icon(@Res() response: Response) {
    this.sendAsset(response, await this.studio.asset('icon'));
  }

  private sendAsset(response: Response, asset: BrandAsset) {
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${asset.filename.replace(/["\r\n]/g, '')}"`,
    );
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    asset.stream.pipe(response);
  }
}

@Controller('admin/operations')
@Roles(UserRole.ADMIN)
export class AdminOperationsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly studio: StudioService,
    private readonly auditLog: AuditService,
  ) {}

  @Get('dashboard')
  dashboard(@Query() query: ReportRangeDto) {
    return this.reports.dashboard(query);
  }

  @Get('reports/appointments')
  appointments(@Query() query: AppointmentReportQueryDto) {
    return this.reports.appointments(query);
  }

  @Get('reports/deposits')
  deposits(@Query() query: DepositReportQueryDto) {
    return this.reports.deposits(query);
  }

  @Get('reports/clients')
  clients(@Query() query: ReportRangeDto) {
    return this.reports.clients(query);
  }

  @Get('reports/designs')
  designs(@Query() query: ReportRangeDto) {
    return this.reports.designs(query);
  }

  @Get('reports/technicians')
  technicians() {
    return this.reports.technicians();
  }

  @Get('audit')
  audit(@Query() query: AuditQueryDto) {
    return this.reports.audit(query);
  }

  @Get('reports/export/:dataset/:format')
  async exportReport(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('dataset') rawDataset: string,
    @Param('format') rawFormat: string,
    @Query() query: ReportExportQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const dataset = this.dataset(rawDataset);
    const format = this.format(rawFormat);
    const result = await this.reports.export(dataset, format, query);
    await this.auditLog.record({
      actorUserId: actor.id,
      action: 'REPORT_EXPORTED',
      entityType: 'Report',
      entityId: dataset,
      metadata: {
        format,
        filters: {
          from: query.from ?? null,
          to: query.to ?? null,
          status: query.status ?? null,
          technicianId: query.technicianId ?? null,
          action: query.action ?? null,
          entityType: query.entityType ?? null,
          actorRole: query.actorRole ?? null,
        },
      },
      ipAddress: requestIp(request),
    });
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.buffer);
  }

  @Get('studio')
  studioSettings() {
    return this.studio.publicSettings();
  }

  @Put('studio')
  updateStudio(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: StudioSettingsDto,
    @Req() request: Request,
  ) {
    return this.studio.update(actor, dto, request);
  }

  @Post('studio/logo')
  @UseInterceptors(brandUpload)
  uploadLogo(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: BrandUpload | undefined,
    @Req() request: Request,
  ) {
    return this.studio.uploadBrandAsset(actor, 'logo', file, request);
  }

  @Post('studio/icon')
  @UseInterceptors(brandUpload)
  uploadIcon(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: BrandUpload | undefined,
    @Req() request: Request,
  ) {
    return this.studio.uploadBrandAsset(actor, 'icon', file, request);
  }

  private dataset(value: string): ExportDataset {
    if (!['appointments', 'deposits', 'clients', 'designs', 'audit'].includes(value)) {
      throw new BadRequestException('Conjunto de reporte no reconocido.');
    }
    return value as ExportDataset;
  }

  private format(value: string): ExportFormat {
    if (!['csv', 'xlsx'].includes(value)) {
      throw new BadRequestException('Formato de reporte no reconocido.');
    }
    return value as ExportFormat;
  }
}
