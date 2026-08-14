import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../infrastructure/prisma.service';
import { RedisService } from '../infrastructure/redis.service';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  status(userId: string) {
    return this.prisma.calendarConnection.findUnique({ where: { userId } }).then((connection) => ({
      enabled: process.env.GOOGLE_CALENDAR_ENABLED === 'true',
      configured: this.configured,
      connected: Boolean(connection?.encryptedRefreshToken || connection?.encryptedAccessToken),
      calendarId: connection?.calendarId ?? 'primary',
      connectedAt: connection?.connectedAt ?? null,
      lastSyncAt: connection?.lastSyncAt ?? null,
      lastError: connection?.lastError ?? null,
    }));
  }

  async authorizationUrl(userId: string) {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_CALENDAR_DISABLED',
        message:
          'Google Calendar está en modo desconectado. Agrega las credenciales al entorno para activarlo.',
      });
    }
    const state = randomBytes(24).toString('base64url');
    await this.redis.client.set(`calendar:oauth:${state}`, userId, 'EX', 10 * 60);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }

  async completeAuthorization(code: string, state: string) {
    if (!this.enabled || !code || !state)
      throw new BadRequestException('Conexión de calendario inválida.');
    const key = `calendar:oauth:${state}`;
    const userId = await this.redis.client.get(key);
    if (!userId) throw new BadRequestException('La conexión caducó. Intenta nuevamente.');
    await this.redis.client.del(key);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'NAIL_TECHNICIAN', status: 'ACTIVE' },
    });
    if (!user) throw new BadRequestException('Este perfil no puede conectar un calendario.');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !tokens.access_token) {
      throw new ServiceUnavailableException(
        tokens.error_description || 'Google rechazó la conexión.',
      );
    }
    await this.prisma.calendarConnection.upsert({
      where: { userId },
      create: {
        userId,
        encryptedAccessToken: this.encrypt(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? this.encrypt(tokens.refresh_token) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        encryptedAccessToken: this.encrypt(tokens.access_token),
        ...(tokens.refresh_token
          ? { encryptedRefreshToken: this.encrypt(tokens.refresh_token) }
          : {}),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        connectedAt: new Date(),
        lastError: null,
      },
    });
    const appointments = await this.prisma.appointment.findMany({
      where: { technicianId: userId, status: 'CONFIRMED', startAt: { gt: new Date() } },
      select: { id: true },
      take: 500,
    });
    for (const appointment of appointments) await this.syncAppointment(appointment.id);
    return userId;
  }

  async disconnect(userId: string) {
    await this.prisma.calendarConnection.deleteMany({ where: { userId } });
    return { disconnected: true };
  }

  async syncAppointment(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { technician: { include: { calendarConnection: true } }, client: true },
    });
    if (!appointment?.technician.calendarConnection) return { skipped: true };
    const connection = appointment.technician.calendarConnection;
    const link = await this.prisma.calendarEventLink.upsert({
      where: { appointmentId },
      create: { appointmentId, technicianId: appointment.technicianId },
      update: { status: 'PENDING', lastError: null },
    });
    try {
      const accessToken = await this.accessToken(appointment.technicianId);
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`;
      if (appointment.status === 'CANCELLED' || appointment.status === 'EXPIRED') {
        if (link.externalEventId) {
          const response = await fetch(`${base}/${encodeURIComponent(link.externalEventId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!response.ok && response.status !== 404)
            throw new Error(`Google Calendar respondió ${response.status}.`);
        }
        await this.prisma.calendarEventLink.update({
          where: { appointmentId },
          data: { status: 'DELETED', lastSyncedAt: new Date(), lastError: null },
        });
        return { deleted: true };
      }
      if (appointment.status !== 'CONFIRMED') return { skipped: true };
      const event = {
        summary: `Dear Angel · ${appointment.client?.fullName ?? appointment.guestName ?? 'Cita'}`,
        description: `Cita administrada por Dear Angel.\nDuración: ${appointment.durationMinutes} minutos.${appointment.notes ? `\nNotas: ${appointment.notes}` : ''}`,
        start: {
          dateTime: appointment.startAt.toISOString(),
          timeZone: process.env.TZ ?? 'America/Merida',
        },
        end: {
          dateTime: appointment.endAt.toISOString(),
          timeZone: process.env.TZ ?? 'America/Merida',
        },
        extendedProperties: { private: { dearAngelAppointmentId: appointment.id } },
      };
      const response = await fetch(
        link.externalEventId ? `${base}/${encodeURIComponent(link.externalEventId)}` : base,
        {
          method: link.externalEventId ? 'PATCH' : 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        },
      );
      const payload = (await response.json()) as { id?: string; error?: { message?: string } };
      if (!response.ok || !payload.id)
        throw new Error(payload.error?.message || `Google Calendar respondió ${response.status}.`);
      await this.prisma.$transaction([
        this.prisma.calendarEventLink.update({
          where: { appointmentId },
          data: {
            externalEventId: payload.id,
            status: 'SYNCED',
            lastSyncedAt: new Date(),
            lastError: null,
          },
        }),
        this.prisma.calendarConnection.update({
          where: { userId: appointment.technicianId },
          data: { lastSyncAt: new Date(), lastError: null },
        }),
      ]);
      return { synced: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await Promise.all([
        this.prisma.calendarEventLink.update({
          where: { appointmentId },
          data: { status: 'FAILED', lastError: message.slice(0, 1000) },
        }),
        this.prisma.calendarConnection.update({
          where: { userId: appointment.technicianId },
          data: { lastError: message.slice(0, 1000) },
        }),
      ]);
      this.logger.error(`No se sincronizó ${appointmentId}: ${message}`);
      return { synced: false };
    }
  }

  async moveAppointment(appointmentId: string, previousTechnicianId: string) {
    const link = await this.prisma.calendarEventLink.findUnique({ where: { appointmentId } });
    if (link?.externalEventId && link.technicianId === previousTechnicianId) {
      const connection = await this.prisma.calendarConnection.findUnique({
        where: { userId: previousTechnicianId },
      });
      if (connection) {
        try {
          const token = await this.accessToken(previousTechnicianId);
          const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(link.externalEventId)}`;
          const response = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok && response.status !== 404)
            throw new Error(`Google Calendar respondió ${response.status}.`);
        } catch (error) {
          this.logger.error(
            `No se eliminó el evento anterior de ${appointmentId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      await this.prisma.calendarEventLink.deleteMany({ where: { appointmentId } });
    }
    return this.syncAppointment(appointmentId);
  }

  private async accessToken(userId: string) {
    const connection = await this.prisma.calendarConnection.findUniqueOrThrow({
      where: { userId },
    });
    if (
      connection.encryptedAccessToken &&
      connection.tokenExpiresAt &&
      connection.tokenExpiresAt.getTime() > Date.now() + 60_000
    ) {
      return this.decrypt(connection.encryptedAccessToken);
    }
    if (!connection.encryptedRefreshToken)
      throw new Error(
        'Google no entregó un token de actualización. Vuelve a conectar el calendario.',
      );
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: this.decrypt(connection.encryptedRefreshToken),
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });
    const tokens = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !tokens.access_token)
      throw new Error(tokens.error_description || 'No se pudo renovar el acceso a Google.');
    await this.prisma.calendarConnection.update({
      where: { userId },
      data: {
        encryptedAccessToken: this.encrypt(tokens.access_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token;
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  private decrypt(value: string) {
    const parts = value.split('.');
    if (parts.length !== 3 || parts.some((part) => !part))
      throw new Error('El token cifrado no es válido.');
    const iv = Buffer.from(parts[0]!, 'base64url');
    const tag = Buffer.from(parts[1]!, 'base64url');
    const encrypted = Buffer.from(parts[2]!, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  private get encryptionKey() {
    return createHash('sha256')
      .update(
        process.env.INTEGRATION_ENCRYPTION_KEY ||
          process.env.OTP_PEPPER ||
          'dear-angel-local-integrations',
      )
      .digest();
  }
  private get configured() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
    );
  }
  private get enabled() {
    return process.env.GOOGLE_CALENDAR_ENABLED === 'true' && this.configured;
  }
  private get redirectUri() {
    return process.env.GOOGLE_REDIRECT_URI!;
  }
}
