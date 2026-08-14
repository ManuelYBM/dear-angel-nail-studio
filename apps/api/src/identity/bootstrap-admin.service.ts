import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma.service';
import { PasswordService } from './password.service';
import { PhoneService } from './phone.service';

const DEVELOPMENT_EMAIL = 'admin@dearangel.local';
const DEVELOPMENT_PASSWORD = 'DearAngelDemo2026';

@Injectable()
export class BootstrapAdminService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly phones: PhoneService,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', archivedAt: null },
    });
    if (existing) return;

    const production = process.env.NODE_ENV === 'production';
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || DEVELOPMENT_EMAIL;
    const password = process.env.ADMIN_INITIAL_PASSWORD || DEVELOPMENT_PASSWORD;
    if (production && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_INITIAL_PASSWORD)) {
      throw new Error(
        'Configura ADMIN_EMAIL y ADMIN_INITIAL_PASSWORD antes de iniciar producción.',
      );
    }
    const phone = process.env.ADMIN_PHONE?.trim()
      ? this.phones.normalize(process.env.ADMIN_PHONE)
      : undefined;
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.user.create({
      data: {
        role: 'ADMIN',
        status: 'ACTIVE',
        fullName: process.env.ADMIN_FULL_NAME?.trim() || 'Administradora Dear Angel',
        email,
        phone,
        passwordHash,
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
      },
    });
    this.logger.warn(
      `Administradora inicial creada: ${email}. Debe cambiar su contraseña al entrar.`,
    );
  }
}
