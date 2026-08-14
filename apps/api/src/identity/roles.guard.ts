import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../common/auth.decorators';
import type { AuthenticatedRequest } from '../common/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.currentUser || !roles.includes(request.currentUser.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'No tienes permisos para realizar esta acción.',
      });
    }
    return true;
  }
}
