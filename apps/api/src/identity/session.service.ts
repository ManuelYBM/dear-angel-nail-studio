import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';

import type { AuthenticatedUser } from '../common/auth.types';
import { requestIp, requestUserAgent } from '../common/request-meta';
import { PrismaService } from '../infrastructure/prisma.service';

export interface SessionAuthentication {
  sessionId: string;
  user: AuthenticatedUser;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: Request, response: Response): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const requestedDays = Number(process.env.SESSION_TTL_DAYS ?? 30);
    const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, requestedDays)) : 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt,
        ipAddress: requestIp(request),
        userAgent: requestUserAgent(request),
      },
    });
    response.cookie(this.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
  }

  async authenticate(token: string): Promise<SessionAuthentication> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Tu sesión no es válida.',
      });
    }

    if (Date.now() - session.lastUsedAt.getTime() > 5 * 60 * 1000) {
      void this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }
    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        role: session.user.role,
        status: session.user.status,
        fullName: session.user.fullName,
        phone: session.user.phone,
        email: session.user.email,
        mustChangePassword: session.user.mustChangePassword,
      },
    };
  }

  tokenFromRequest(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieToken = cookies?.[this.cookieName];
    if (cookieToken) return cookieToken;
    const authorization = request.get('authorization');
    return authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  clearCookie(response: Response): void {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }

  private get cookieName(): string {
    return process.env.SESSION_COOKIE_NAME ?? 'da_session';
  }
}
