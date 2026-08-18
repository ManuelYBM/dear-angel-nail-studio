import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

function executionContext(handler: (...args: never[]) => unknown, request: object) {
  return {
    getHandler: () => handler,
    getClass: () => AuthController,
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function controllerHandler(name: keyof AuthController): (...args: never[]) => unknown {
  return Reflect.get(AuthController.prototype, name) as (...args: never[]) => unknown;
}

describe('AuthGuard mustChangePassword', () => {
  const authentication = {
    sessionId: 'session-id',
    user: {
      id: 'user-id',
      role: 'NAIL_TECHNICIAN',
      status: 'ACTIVE',
      fullName: 'Técnica',
      phone: null,
      email: 'tech@example.com',
      mustChangePassword: true,
    },
  };

  function guard() {
    const sessions = {
      tokenFromRequest: vi.fn().mockReturnValue('token'),
      authenticate: vi.fn().mockResolvedValue(authentication),
    };
    return new AuthGuard(new Reflector(), sessions as never);
  }

  it.each([
    ['me', controllerHandler('me')],
    ['change-password', controllerHandler('changePassword')],
    ['logout', controllerHandler('logout')],
    ['logout-all', controllerHandler('logoutAll')],
  ])('permite %s mientras obliga el cambio', async (_name, handler) => {
    await expect(guard().canActivate(executionContext(handler, {}) as never)).resolves.toBe(true);
  });

  it.each([['profile', controllerHandler('updateProfile')]])(
    'bloquea %s mientras la contraseña sea temporal',
    async (_name, handler) => {
      await expect(guard().canActivate(executionContext(handler, {}) as never)).rejects.toThrow();
    },
  );
});
