import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';

export const IS_PUBLIC_KEY = 'dear-angel:is-public';
export const ROLES_KEY = 'dear-angel:roles';
export const ALLOW_PASSWORD_CHANGE_REQUIRED_KEY = 'dear-angel:allow-password-change-required';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const AllowPasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.currentUser) {
      throw new Error('CurrentUser requiere una sesión autenticada');
    }
    return request.currentUser;
  },
);

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.sessionId) {
      throw new Error('CurrentSessionId requiere una sesión autenticada');
    }
    return request.sessionId;
  },
);
