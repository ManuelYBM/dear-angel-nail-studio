import type { Request } from 'express';

export function requestIp(request: Request): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return raw?.trim() || request.ip || request.socket.remoteAddress;
}

export function requestUserAgent(request: Request): string | undefined {
  return request.get('user-agent')?.slice(0, 500);
}
