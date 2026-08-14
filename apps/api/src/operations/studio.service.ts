import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { AuthenticatedUser } from '../common/auth.types';
import { requestIp } from '../common/request-meta';
import { AuditService } from '../identity/audit.service';
import { PrismaService } from '../infrastructure/prisma.service';
import { StorageService } from '../infrastructure/storage.service';
import type { StudioSettingsDto } from './operations.dto';

export interface BrandUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface BrandAsset {
  stream: Readable;
  mimeType: string;
  filename: string;
}

@Injectable()
export class StudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async publicSettings() {
    const settings = await this.settings();
    return { settings: this.safeSettings(settings) };
  }

  async update(actor: AuthenticatedUser, dto: StudioSettingsDto, request: Request) {
    const settings = await this.prisma.studioSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...this.settingsData(dto) },
      update: this.settingsData(dto),
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'STUDIO_SETTINGS_UPDATED',
      entityType: 'StudioSettings',
      entityId: settings.id,
      metadata: { changedFields: Object.keys(dto) },
      ipAddress: requestIp(request),
    });
    return { settings: this.safeSettings(settings) };
  }

  async uploadBrandAsset(
    actor: AuthenticatedUser,
    kind: 'logo' | 'icon',
    file: BrandUpload | undefined,
    request: Request,
  ) {
    const asset = this.assertAsset(kind, file);
    const settings = await this.settings();
    const previousKey = kind === 'logo' ? settings.logoObjectKey : settings.iconObjectKey;
    const objectKey = `brand/${kind}/${randomUUID()}-${this.safeFilename(asset.originalname)}`;
    await this.storage.putObject(objectKey, asset.buffer, asset.mimetype);
    let updated: Awaited<ReturnType<PrismaService['studioSettings']['update']>>;
    try {
      updated = await this.prisma.studioSettings.update({
        where: { id: 'default' },
        data: {
          ...(kind === 'logo'
            ? {
                logoObjectKey: objectKey,
                logoMimeType: asset.mimetype,
                logoFilename: asset.originalname,
              }
            : {
                iconObjectKey: objectKey,
                iconMimeType: asset.mimetype,
                iconFilename: asset.originalname,
              }),
          brandVersion: { increment: 1 },
        },
      });
    } catch (error) {
      await this.storage.removeObject(objectKey).catch(() => undefined);
      throw error;
    }
    if (previousKey) await this.storage.removeObject(previousKey).catch(() => undefined);
    await this.audit.record({
      actorUserId: actor.id,
      action: kind === 'logo' ? 'STUDIO_LOGO_UPDATED' : 'STUDIO_ICON_UPDATED',
      entityType: 'StudioSettings',
      entityId: updated.id,
      metadata: { filename: asset.originalname, mimeType: asset.mimetype, size: asset.size },
      ipAddress: requestIp(request),
    });
    return { settings: this.safeSettings(updated) };
  }

  async asset(kind: 'logo' | 'icon'): Promise<BrandAsset> {
    const settings = await this.settings();
    const objectKey = kind === 'logo' ? settings.logoObjectKey : settings.iconObjectKey;
    const mimeType = kind === 'logo' ? settings.logoMimeType : settings.iconMimeType;
    const filename = kind === 'logo' ? settings.logoFilename : settings.iconFilename;
    if (!objectKey || !mimeType || !filename)
      throw new NotFoundException('Este recurso de marca todavía no fue personalizado.');
    return { stream: await this.storage.getObject(objectKey), mimeType, filename };
  }

  private async settings() {
    return this.prisma.studioSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  private settingsData(dto: StudioSettingsDto) {
    return {
      businessName: dto.businessName.trim(),
      tagline: dto.tagline.trim(),
      city: dto.city.trim(),
      state: dto.state.trim(),
      addressLine: dto.addressLine?.trim() || null,
      publicPhone: dto.publicPhone?.trim() || null,
      whatsapp: dto.whatsapp?.trim() || null,
      instagramUrl: dto.instagramUrl?.trim() || null,
      facebookUrl: dto.facebookUrl?.trim() || null,
      tiktokUrl: dto.tiktokUrl?.trim() || null,
      websiteUrl: dto.websiteUrl?.trim() || null,
      mapUrl: dto.mapUrl?.trim() || null,
    };
  }

  private safeSettings(settings: Awaited<ReturnType<StudioService['settings']>>) {
    return {
      id: settings.id,
      businessName: settings.businessName,
      tagline: settings.tagline,
      city: settings.city,
      state: settings.state,
      addressLine: settings.addressLine,
      publicPhone: settings.publicPhone,
      whatsapp: settings.whatsapp,
      instagramUrl: settings.instagramUrl,
      facebookUrl: settings.facebookUrl,
      tiktokUrl: settings.tiktokUrl,
      websiteUrl: settings.websiteUrl,
      mapUrl: settings.mapUrl,
      brandVersion: settings.brandVersion,
      hasLogo: Boolean(settings.logoObjectKey),
      hasIcon: Boolean(settings.iconObjectKey),
      updatedAt: settings.updatedAt,
    };
  }

  private assertAsset(kind: 'logo' | 'icon', file?: BrandUpload) {
    if (!file)
      throw new BadRequestException(`Selecciona ${kind === 'logo' ? 'un logo' : 'un icono'}.`);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Usa una imagen PNG, JPG o WebP.');
    }
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('La imagen no puede superar 5 MB.');
    return file;
  }

  private safeFilename(filename: string) {
    return (
      filename
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .slice(-120) || 'marca'
    );
  }
}
