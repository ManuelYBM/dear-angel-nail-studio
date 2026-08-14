import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../common/auth.decorators';
import type { AuthenticatedRequest } from '../common/auth.types';
import { SessionService } from './session.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.sessions.tokenFromRequest(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'SESSION_REQUIRED',
        message: 'Inicia sesión para continuar.',
      });
    }
    const authentication = await this.sessions.authenticate(token);
    request.currentUser = authentication.user;
    request.sessionId = authentication.sessionId;
    return true;
  }
}
