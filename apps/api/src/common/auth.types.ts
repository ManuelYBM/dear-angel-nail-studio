import type { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  status: UserStatus;
  fullName: string;
  phone: string | null;
  email: string | null;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  currentUser?: AuthenticatedUser;
  sessionId?: string;
}
