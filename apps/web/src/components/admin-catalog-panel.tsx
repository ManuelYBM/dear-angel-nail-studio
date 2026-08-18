'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { apiFetch } from '@/lib/api';
import type { CalculatorOption, CatalogDesign, CatalogImage, CurrentUser } from '@/lib/api';
import styles from './admin-catalog.module.css';
import portal from './portal.module.css';

export function AdminCatalogPanel() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [designs, setDesigns] = useState<CatalogDesign[]>([]);
  const [options, setOptions] = useState<CalculatorOption[]>([]);
  const [tab, setTab] = useState<'designs' | 'calculator'>('designs');
  const [editing, setEditing] = useState<CatalogDesign | null>(null);
  const [editingOption, setEditingOption] = useState<CalculatorOption | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [session, catalog, calculator] = await Promise.all([
        apiFetch<{ user: CurrentUser }>('/auth/me'),
        apiFetch<{ items: CatalogDesign[] }>('/admin/catalog/designs'),
        apiFetch<{ items: CalculatorOption[] }>('/admin/catalog/calculator'),
      ]);
      if (session.user.role !== 'ADMIN') {
        window.location.href = '/mi-cuenta';
        return;
      }
      setUser(session.user);
      setDesigns(catalog.items);
      setOptions(calculator.items);
    } catch {
      window.location.href = '/acceso';
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const categoryValue = data.get('categories');
      const categories =
        typeof categoryValue === 'string'
          ? categoryValue
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [];
      const payload = {
        title: data.get('title'),
        description: data.get('description'),
        priceCents: Math.round(Number(data.get('price')) * 100),
        durationMinutes: Number(data.get('durationMinutes')),
        technique: data.get('technique'),
        nailLength: data.get('nailLength') || undefined,
        categories,
        published: data.get('published') === 'on',
        featured: data.get('featured') === 'on',
        sortOrder: Number(data.get('sortOrder') || 0),
      };
      const result = await apiFetch<{ design: CatalogDesign }>(
        editing ? `/admin/catalog/designs/${editing.id}` : '/admin/catalog/designs',
        { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );
      const file = (form.elements.namedItem('image') as HTMLInputElement | null)?.files?.[0];
      if (file) {
        const imageForm = new FormData();
        imageForm.append('image', file);
        const uploaded = await apiFetch<{ image: CatalogImage }>(
          `/admin/catalog/designs/${result.design.id}/images`,
          { method: 'POST', body: imageForm },
        );
        await apiFetch(`/admin/catalog/images/${uploaded.image.id}/cover`, { method: 'PATCH' });
      }
      form.reset();
      setEditing(null);
      setSuccess('Diseño guardado.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar el diseño.');
    } finally {
      setBusy(false);
    }
  }

  async function removeDesignImage(image: CatalogImage) {
    if (!editing) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/admin/catalog/images/${image.id}`, { method: 'DELETE' });
      setEditing((current) =>
        current
          ? { ...current, images: current.images.filter((item) => item.id !== image.id) }
          : current,
      );
      setDesigns((current) =>
        current.map((design) =>
          design.id === editing.id
            ? { ...design, images: design.images.filter((item) => item.id !== image.id) }
            : design,
        ),
      );
      setSuccess(
        image.id === editing.images[0]?.id
          ? 'La portada se eliminó. La siguiente imagen, si existe, ahora es la portada.'
          : 'La imagen se eliminó.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos eliminar la imagen.');
    } finally {
      setBusy(false);
    }
  }

  async function makeCover(image: CatalogImage) {
    if (!editing || editing.images[0]?.id === image.id) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/admin/catalog/images/${image.id}/cover`, { method: 'PATCH' });
      const reorder = (images: CatalogImage[]) => [
        image,
        ...images.filter((item) => item.id !== image.id),
      ];
      setEditing((current) =>
        current ? { ...current, images: reorder(current.images) } : current,
      );
      setDesigns((current) =>
        current.map((design) =>
          design.id === editing.id ? { ...design, images: reorder(design.images) } : design,
        ),
      );
      setSuccess('La portada del diseño quedó actualizada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos cambiar la portada.');
    } finally {
      setBusy(false);
    }
  }

  async function removeDesign(design: CatalogDesign) {
    if (!window.confirm(`¿Eliminar “${design.title}” del catálogo?`)) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/admin/catalog/designs/${design.id}`, { method: 'DELETE' });
      setDesigns((current) => current.filter((item) => item.id !== design.id));
      if (editing?.id === design.id) setEditing(null);
      setSuccess('El diseño se eliminó del catálogo.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos eliminar el diseño.');
    } finally {
      setBusy(false);
    }
  }

  async function saveOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const payload = {
        kind: data.get('kind'),
        code: data.get('code'),
        name: data.get('name'),
        description: data.get('description') || undefined,
        iconText: data.get('iconText') || undefined,
        priceCents: Math.round(Number(data.get('price')) * 100),
        durationMinutes: Number(data.get('durationMinutes')),
        pricingMode: data.get('pricingMode'),
        maxQuantity: Number(data.get('maxQuantity')),
        parentOptionId: data.get('parentOptionId') || undefined,
        active: data.get('active') === 'on',
        sortOrder: Number(data.get('sortOrder') || 0),
      };
      const result = await apiFetch<{ option: CalculatorOption }>(
        editingOption
          ? `/admin/catalog/calculator/${editingOption.id}`
          : '/admin/catalog/calculator',
        { method: editingOption ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );
      const file = (form.elements.namedItem('icon') as HTMLInputElement | null)?.files?.[0];
      if (file) {
        const iconForm = new FormData();
        iconForm.append('image', file);
        await apiFetch(`/admin/catalog/calculator/${result.option.id}/icon`, {
          method: 'POST',
          body: iconForm,
        });
      }
      form.reset();
      setEditingOption(null);
      setSuccess('Opción guardada.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pudimos guardar la opción.');
    }
  }

  if (!user) return <div className={portal.loading}>Abriendo administración…</div>;
  return (
    <div>
      <div className={styles.tabs}>
        <button
          className={tab === 'designs' ? styles.active : ''}
          onClick={() => setTab('designs')}
          type="button"
        >
          Catálogo
        </button>
        <button
          className={tab === 'calculator' ? styles.active : ''}
          onClick={() => setTab('calculator')}
          type="button"
        >
          Calculadora
        </button>
      </div>
      {error ? <div className={portal.error}>{error}</div> : null}
      {success ? <div className={portal.success}>{success}</div> : null}
      {tab === 'designs' ? (
        <div className={styles.layout}>
          <form className={styles.form} key={editing?.id ?? 'new'} onSubmit={saveDesign}>
            <h2>{editing ? 'Editar diseño' : 'Nuevo diseño'}</h2>
            <label>
              Título
              <input defaultValue={editing?.title} name="title" required />
            </label>
            <label>
              Descripción
              <textarea defaultValue={editing?.description} name="description" required rows={4} />
            </label>
            <div>
              <label>
                Precio MXN
                <input
                  defaultValue={editing ? editing.priceCents / 100 : ''}
                  min="0"
                  name="price"
                  required
                  type="number"
                />
              </label>
              <label>
                Duración
                <input
                  defaultValue={editing?.durationMinutes ?? 60}
                  min="15"
                  name="durationMinutes"
                  required
                  step="15"
                  type="number"
                />
              </label>
            </div>
            <div>
              <label>
                Técnica
                <input defaultValue={editing?.technique} name="technique" required />
              </label>
              <label>
                Largo
                <input defaultValue={editing?.nailLength ?? ''} name="nailLength" />
              </label>
            </div>
            <label>
              Categorías separadas por coma
              <input defaultValue={editing?.categories.join(', ')} name="categories" />
            </label>
            <label>
              {editing?.images.length ? 'Nueva portada JPG, PNG o WebP' : 'Portada JPG, PNG o WebP'}
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={(editing?.images.length ?? 0) >= 5}
                name="image"
                type="file"
              />
              {(editing?.images.length ?? 0) >= 5 ? (
                <small>Elimina una imagen para liberar uno de los cinco espacios.</small>
              ) : null}
            </label>
            {editing?.images.length ? (
              <fieldset className={styles.imageManager}>
                <legend>Imágenes actuales</legend>
                <p>
                  La primera imagen es la portada. Puedes cambiarla sin eliminar las demás; una
                  imagen nueva también se convertirá en portada.
                </p>
                <div>
                  {editing.images.map((image, index) => (
                    <figure key={image.id}>
                      <img
                        alt={index === 0 ? `Portada actual de ${editing.title}` : editing.title}
                        src={`/api/backend/catalog/images/${image.id}`}
                      />
                      <figcaption>{index === 0 ? 'Portada' : `Imagen ${index + 1}`}</figcaption>
                      {index > 0 ? (
                        <button disabled={busy} onClick={() => void makeCover(image)} type="button">
                          Usar como portada
                        </button>
                      ) : null}
                      <button
                        disabled={busy}
                        onClick={() => void removeDesignImage(image)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    </figure>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div>
              <label>
                Orden
                <input
                  defaultValue={editing?.sortOrder ?? 0}
                  min="0"
                  name="sortOrder"
                  type="number"
                />
              </label>
              <label className={styles.check}>
                <input defaultChecked={editing?.published} name="published" type="checkbox" />
                Publicado
              </label>
              <label className={styles.check}>
                <input defaultChecked={editing?.featured} name="featured" type="checkbox" />
                Destacado
              </label>
            </div>
            <button className={portal.primaryButton} disabled={busy} type="submit">
              {busy ? 'Guardando…' : 'Guardar diseño'}
            </button>
            {editing ? (
              <button
                className={portal.secondaryButton}
                onClick={() => setEditing(null)}
                type="button"
              >
                Cancelar edición
              </button>
            ) : null}
          </form>
          <div className={styles.items}>
            {designs.map((design) => (
              <article key={design.id}>
                <div>
                  {design.images[0] ? (
                    <img alt="" src={`/api/backend/catalog/images/${design.images[0].id}`} />
                  ) : (
                    <span>DA</span>
                  )}
                </div>
                <section>
                  <small>{design.published ? 'Publicado' : 'Borrador'}</small>
                  <h3>{design.title}</h3>
                  <p>
                    ${design.priceCents / 100} · {design.durationMinutes} min
                  </p>
                  <button onClick={() => setEditing(design)} type="button">
                    Editar
                  </button>
                  <button
                    className={styles.deleteButton}
                    disabled={busy}
                    onClick={() => void removeDesign(design)}
                    type="button"
                  >
                    Eliminar
                  </button>
                </section>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.layout}>
          <form
            className={styles.form}
            key={editingOption?.id ?? 'new-option'}
            onSubmit={saveOption}
          >
            <h2>{editingOption ? 'Editar opción' : 'Nueva opción'}</h2>
            <div>
              <label>
                Tipo
                <select defaultValue={editingOption?.kind ?? 'DECORATION'} name="kind">
                  <option value="TECHNIQUE">Técnica</option>
                  <option value="LENGTH">Largo</option>
                  <option value="DECORATION">Decoración</option>
                  <option value="EXTRA">Extra</option>
                </select>
              </label>
              <label>
                Código
                <input defaultValue={editingOption?.code} name="code" required />
              </label>
            </div>
            <label>
              Nombre
              <input defaultValue={editingOption?.name} name="name" required />
            </label>
            <label>
              Descripción
              <input defaultValue={editingOption?.description ?? ''} name="description" />
            </label>
            <div>
              <label>
                Emoji
                <input defaultValue={editingOption?.iconText ?? ''} name="iconText" />
              </label>
              <label>
                Icono personalizado
                <input accept="image/jpeg,image/png,image/webp" name="icon" type="file" />
              </label>
            </div>
            <div>
              <label>
                Precio MXN
                <input
                  defaultValue={editingOption ? editingOption.priceCents / 100 : 0}
                  min="0"
                  name="price"
                  type="number"
                />
              </label>
              <label>
                Minutos
                <input
                  defaultValue={editingOption?.durationMinutes ?? 0}
                  min="0"
                  name="durationMinutes"
                  type="number"
                />
              </label>
            </div>
            <div>
              <label>
                Cobro
                <select defaultValue={editingOption?.pricingMode ?? 'FIXED'} name="pricingMode">
                  <option value="FIXED">Fijo</option>
                  <option value="PER_UNIT">Por uña</option>
                </select>
              </label>
              <label>
                Cantidad máxima
                <input
                  defaultValue={editingOption?.maxQuantity ?? 1}
                  max="20"
                  min="1"
                  name="maxQuantity"
                  type="number"
                />
              </label>
            </div>
            <label>
              Depende de técnica
              <select defaultValue={editingOption?.parentOptionId ?? ''} name="parentOptionId">
                <option value="">Ninguna</option>
                {options
                  .filter((option) => option.kind === 'TECHNIQUE')
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <label>
                Orden
                <input
                  defaultValue={editingOption?.sortOrder ?? 0}
                  min="0"
                  name="sortOrder"
                  type="number"
                />
              </label>
              <label className={styles.check}>
                <input
                  defaultChecked={editingOption?.active ?? true}
                  name="active"
                  type="checkbox"
                />
                Activa
              </label>
            </div>
            <button className={portal.primaryButton} type="submit">
              Guardar opción
            </button>
          </form>
          <div className={styles.optionList}>
            {options.map((option) => (
              <button key={option.id} onClick={() => setEditingOption(option)} type="button">
                <span>{option.iconText ?? '✦'}</span>
                <div>
                  <strong>{option.name}</strong>
                  <small>
                    {option.kind} · ${option.priceCents / 100}
                    {option.pricingMode === 'PER_UNIT' ? '/uña' : ''}
                  </small>
                </div>
                <em>{option.active ? 'Activa' : 'Oculta'}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
