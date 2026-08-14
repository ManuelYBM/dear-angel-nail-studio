import type { LoyaltyProfile } from '@/lib/api';
import styles from './loyalty.module.css';

const stateLabels = { LOCKED: 'Bloqueada', AVAILABLE: 'Disponible', REDEEMED: 'Utilizada' };

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Merida' }).format(
    new Date(value),
  );

export function LoyaltyJourney({
  profile,
  compact = false,
}: {
  profile: LoyaltyProfile;
  compact?: boolean;
}) {
  const available = profile.coupons.filter((coupon) => coupon.status === 'AVAILABLE');
  const redeemed = profile.coupons.filter((coupon) => coupon.status === 'REDEEMED');
  const next = profile.journey.find((item) => item.state === 'LOCKED');

  return (
    <div>
      <div className={styles.summary}>
        <div>
          <span>Camino Dear Angel</span>
          <strong>{profile.visitCount} visitas</strong>
          <p>
            {next
              ? `Te faltan ${Math.max(0, next.visitNumber - profile.visitCount)} para “${next.title}”.`
              : 'Has desbloqueado todos los hitos actuales.'}
          </p>
        </div>
        <div>
          <span>Disponibles</span>
          <strong>{available.length}</strong>
          <p>Recuérdaselos a tu manicurista antes de pagar.</p>
        </div>
        <div>
          <span>Utilizados</span>
          <strong>{redeemed.length}</strong>
          <p>Tu historial permanece visible para siempre.</p>
        </div>
      </div>

      <section className={styles.journeySection}>
        <span className={styles.sectionLabel}>Tu progreso</span>
        <h2>Cada visita abre algo bonito</h2>
        <div className={styles.journey}>
          {profile.journey.map((item) => (
            <article
              className={`${styles.milestone} ${styles[item.state.toLowerCase() as 'locked' | 'available' | 'redeemed']}`}
              key={item.id}
            >
              <span className={styles.milestoneIcon}>
                {item.state === 'LOCKED' ? item.visitNumber : item.iconText}
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <em>{stateLabels[item.state]}</em>
            </article>
          ))}
          {!profile.journey.length ? <p>Aún no hay recompensas configuradas.</p> : null}
        </div>
      </section>

      <section className={styles.couponSection}>
        <span className={styles.sectionLabel}>Tus beneficios</span>
        <h2>Cupones disponibles</h2>
        <div className={styles.couponGrid}>
          {available.map((coupon) => (
            <article className={styles.coupon} key={coupon.id}>
              <span>{coupon.iconText}</span>
              <h3>{coupon.title}</h3>
              <p>{coupon.description}</p>
              <small>Un uso · No combinable · Se aplica al pago en el estudio</small>
            </article>
          ))}
          {!available.length ? <p>No tienes cupones disponibles por ahora.</p> : null}
        </div>
      </section>

      {!compact ? (
        <>
          <section className={styles.couponSection}>
            <span className={styles.sectionLabel}>Historial</span>
            <h2>Cupones utilizados</h2>
            <div className={styles.couponGrid}>
              {redeemed.map((coupon) => (
                <article className={`${styles.coupon} ${styles.couponUsed}`} key={coupon.id}>
                  <span>{coupon.iconText}</span>
                  <h3>{coupon.title}</h3>
                  <p>{coupon.description}</p>
                  <small>Utilizado {coupon.redeemedAt ? dateLabel(coupon.redeemedAt) : ''}</small>
                </article>
              ))}
            </div>
          </section>
          <section className={styles.historySection}>
            <span className={styles.sectionLabel}>Movimientos</span>
            <h2>Historial de visitas</h2>
            <div className={styles.historyList}>
              {profile.visitHistory.map((entry) => (
                <div key={entry.id}>
                  <div>
                    <span>
                      {entry.reason === 'APPOINTMENT_COMPLETED'
                        ? 'Cita atendida'
                        : 'Corrección administrativa'}
                    </span>
                    <small>
                      {dateLabel(entry.createdAt)} · {entry.note ?? entry.createdBy.fullName}
                    </small>
                  </div>
                  <strong>
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
