import type { CurrentUser, Sex, UserRole, UserStatus } from './api';

type PersonIdentity = Pick<CurrentUser, 'role' | 'sex'>;

export function clientLabel(sex: Sex | null | undefined, capitalized = true) {
  const label = sex === 'FEMALE' ? 'clienta' : sex === 'MALE' ? 'cliente' : 'cliente/a';
  return capitalized ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}

export function roleLabel(person: PersonIdentity) {
  if (person.role === 'ADMIN') return 'Administradora';
  if (person.role === 'NAIL_TECHNICIAN') return 'Manicurista';
  return clientLabel(person.sex);
}

export function statusLabel(status: UserStatus, sex: Sex | null | undefined) {
  const feminine = sex === 'FEMALE';
  const neutral = sex !== 'FEMALE' && sex !== 'MALE';

  if (neutral) {
    const neutralLabels: Record<UserStatus, string> = {
      INVITED: 'Invitación pendiente',
      PENDING_VERIFICATION: 'Por verificar',
      ACTIVE: 'Perfil activo',
      PAUSED: 'Perfil en pausa',
      ARCHIVED: 'Perfil archivado',
    };
    return neutralLabels[status];
  }

  const labels: Record<UserStatus, [string, string]> = {
    INVITED: ['Invitado', 'Invitada'],
    PENDING_VERIFICATION: ['Por verificar', 'Por verificar'],
    ACTIVE: ['Activo', 'Activa'],
    PAUSED: ['Pausado', 'Pausada'],
    ARCHIVED: ['Archivado', 'Archivada'],
  };
  return labels[status][feminine ? 1 : 0];
}

export function roleOptionLabel(role: UserRole) {
  if (role === 'ADMIN') return 'Administradora';
  if (role === 'NAIL_TECHNICIAN') return 'Manicurista';
  return 'Cliente';
}
