'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { ChallengeResult, CurrentUser, UserRole } from '@/lib/api';
import { clientLabel, roleLabel, statusLabel } from '@/lib/person';
import { PasswordField } from './password-field';
import { PhoneField } from './phone-field';
import styles from './portal.module.css';

interface AdminUser extends CurrentUser {
  phoneVerifiedAt: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: AdminUser[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}

export function AdminUsersPanel() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [role, setRole] = useState<UserRole>('CLIENT');
  const [filterRole, setFilterRole] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [recovery, setRecovery] = useState<ChallengeResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (filterRole) params.set('role', filterRole);
    if (search.trim()) params.set('search', search.trim());
    const response = await apiFetch<ListResponse>(`/admin/users?${params.toString()}`);
    setUsers(response.items);
  }, [filterRole, search]);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then(({ user }) => {
        if (user.role !== 'ADMIN') throw new Error('Sin permisos');
        return loadUsers();
      })
      .catch(() => router.replace('/acceso'))
      .finally(() => setLoading(false));
  }, [loadUsers, router]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setTemporaryPassword('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await apiFetch<{ user: AdminUser; temporaryPassword?: string }>(
        '/admin/users',
        {
          method: 'POST',
          body: JSON.stringify({
            role,
            fullName: data.get('fullName'),
            sex: data.get('sex'),
            phone: data.get('phone') || undefined,
            email: data.get('email') || undefined,
            temporaryPassword: data.get('temporaryPassword') || undefined,
          }),
        },
      );
      setTemporaryPassword(result.temporaryPassword ?? '');
      const createdSex = data.get('sex') as CurrentUser['sex'];
      setNotice(
        role === 'CLIENT'
          ? `Perfil de ${clientLabel(createdSex, false)} creado. Puede activarlo desde “Olvidé mi contraseña”.`
          : 'Cuenta de manicurista creada correctamente.',
      );
      form.reset();
      await loadUsers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos crear el perfil.');
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch(`/admin/users/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: data.get('fullName'),
          sex: data.get('sex'),
          phone: data.get('phone') || null,
          email: data.get('email') || null,
        }),
      });
      setEditing(null);
      setNotice('Los datos del perfil quedaron actualizados.');
      await loadUsers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos actualizar el perfil.');
    }
  }

  async function changeStatus(user: AdminUser, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice(
        `El perfil de ${user.fullName} ahora está en estado: ${statusLabel(status, user.sex).toLowerCase()}.`,
      );
      await loadUsers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cambiar el estado.');
    }
  }

  async function sendRecovery(user: AdminUser) {
    setError('');
    setRecovery(null);
    try {
      const result = await apiFetch<{ recovery: ChallengeResult }>(
        `/admin/users/${user.id}/password-reset`,
        { method: 'POST' },
      );
      setRecovery(result.recovery);
      setNotice(`Enviamos instrucciones de recuperación para ${user.fullName}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos iniciar la recuperación.');
    }
  }

  if (loading)
    return <div className={styles.loading}>Preparando el panel de la administradora…</div>;

  return (
    <>
      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}
      {temporaryPassword ? (
        <div className={styles.mockCode}>
          Contraseña temporal; cópiala ahora porque no volverá a mostrarse.
          <strong>{temporaryPassword}</strong>
        </div>
      ) : null}
      {recovery?.debugCode ? (
        <div className={styles.mockCode}>
          Código de depuración devuelto por el entorno local para {recovery.destination}.
          <strong>{recovery.debugCode}</strong>
        </div>
      ) : null}

      <div className={styles.adminColumns}>
        <section className={styles.softCard}>
          <h2 className={styles.sectionTitle}>{editing ? 'Editar perfil' : 'Crear perfil'}</h2>
          {editing ? (
            <form className={styles.form} onSubmit={updateUser}>
              <div className={styles.field}>
                <label htmlFor="editFullName">Nombre completo</label>
                <input defaultValue={editing.fullName} id="editFullName" name="fullName" required />
              </div>
              <div className={styles.field}>
                <label htmlFor="editSex">Sexo</label>
                <select defaultValue={editing.sex ?? 'PREFER_NOT_TO_SAY'} id="editSex" name="sex">
                  <option value="FEMALE">Mujer</option>
                  <option value="MALE">Hombre</option>
                  <option value="OTHER">Otro</option>
                  <option value="PREFER_NOT_TO_SAY">Prefiero no responder</option>
                </select>
              </div>
              <PhoneField
                defaultValue={editing.phone}
                id="editPhone"
                label="WhatsApp"
                name="phone"
              />
              <div className={styles.field}>
                <label htmlFor="editEmail">Correo</label>
                <input
                  defaultValue={editing.email ?? ''}
                  id="editEmail"
                  name="email"
                  type="email"
                />
              </div>
              <div className={styles.buttonRow}>
                <button className={styles.primaryButton} type="submit">
                  Guardar cambios
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setEditing(null)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <form className={styles.form} onSubmit={createUser}>
              <div className={styles.field}>
                <label htmlFor="role">Tipo de perfil</label>
                <select
                  id="role"
                  onChange={(event) => setRole(event.target.value as UserRole)}
                  value={role}
                >
                  <option value="CLIENT">Cliente</option>
                  <option value="NAIL_TECHNICIAN">Manicurista</option>
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="fullName">Nombre completo</label>
                <input id="fullName" name="fullName" required />
              </div>
              <div className={styles.field}>
                <label htmlFor="sex">Sexo</label>
                <select defaultValue="PREFER_NOT_TO_SAY" id="sex" name="sex">
                  <option value="FEMALE">Mujer</option>
                  <option value="MALE">Hombre</option>
                  <option value="OTHER">Otro</option>
                  <option value="PREFER_NOT_TO_SAY">Prefiero no responder</option>
                </select>
              </div>
              <PhoneField
                id="phone"
                label={`WhatsApp ${role === 'CLIENT' ? '(obligatorio)' : '(opcional)'}`}
                name="phone"
                required={role === 'CLIENT'}
              />
              <div className={styles.field}>
                <label htmlFor="email">
                  Correo {role === 'NAIL_TECHNICIAN' ? '(obligatorio)' : ''}
                </label>
                <input id="email" name="email" required={role === 'NAIL_TECHNICIAN'} type="email" />
              </div>
              <PasswordField
                autoComplete="new-password"
                hint="Para manicuristas se genera una automáticamente si la dejas vacía."
                id="temporaryPassword"
                label="Contraseña temporal (opcional)"
                name="temporaryPassword"
              />
              <button className={styles.primaryButton} type="submit">
                Crear perfil
              </button>
            </form>
          )}
        </section>

        <section>
          <div className={styles.toolbar}>
            <h2 className={styles.sectionTitle}>Directorio · {users.length}</h2>
            <div className={styles.toolbarGroup}>
              <input
                className={styles.input}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre, teléfono…"
                value={search}
              />
              <select
                className={styles.input}
                onChange={(event) => setFilterRole(event.target.value)}
                value={filterRole}
              >
                <option value="">Todos los roles</option>
                <option value="CLIENT">Clientes</option>
                <option value="NAIL_TECHNICIAN">Manicuristas</option>
                <option value="ADMIN">Administradora</option>
              </select>
            </div>
          </div>
          <div className={styles.userGrid}>
            {users.map((user) => (
              <article className={styles.userCard} key={user.id}>
                <div className={styles.userTop}>
                  <div>
                    <h3>{user.fullName}</h3>
                    <p>{roleLabel(user)}</p>
                  </div>
                  <span className={styles.badge}>{statusLabel(user.status, user.sex)}</span>
                </div>
                <div className={styles.userMeta}>{user.phone ?? user.email ?? 'Sin contacto'}</div>
                {user.role !== 'ADMIN' ? (
                  <div className={styles.userActions}>
                    <button onClick={() => setEditing(user)} type="button">
                      Editar
                    </button>
                    <button onClick={() => sendRecovery(user)} type="button">
                      Recuperar acceso
                    </button>
                    {user.status === 'ACTIVE' ? (
                      <button onClick={() => changeStatus(user, 'PAUSED')} type="button">
                        Pausar
                      </button>
                    ) : user.status === 'PAUSED' ? (
                      <button onClick={() => changeStatus(user, 'ACTIVE')} type="button">
                        Reactivar
                      </button>
                    ) : null}
                    {user.status !== 'ARCHIVED' ? (
                      <button onClick={() => changeStatus(user, 'ARCHIVED')} type="button">
                        Archivar
                      </button>
                    ) : user.phoneVerifiedAt || user.role !== 'CLIENT' ? (
                      <button onClick={() => changeStatus(user, 'ACTIVE')} type="button">
                        Restaurar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
