export type UserRole = 'ADMIN' | 'NAIL_TECHNICIAN' | 'CLIENT';
export type UserStatus = 'INVITED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type Sex = 'FEMALE' | 'MALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export interface CurrentUser {
  id: string;
  role: UserRole;
  status: UserStatus;
  fullName: string;
  sex: Sex | null;
  phone: string | null;
  email: string | null;
  mustChangePassword: boolean;
}

export type NotificationKind =
  'APPOINTMENT' | 'QUOTE' | 'PAYMENT' | 'COUPON' | 'REMINDER' | 'SYSTEM';

export interface UserNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  deliveries: Array<{
    id: string;
    channel: 'WHATSAPP' | 'EMAIL';
    status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED';
    attempts: number;
    provider: string | null;
    lastError: string | null;
    sentAt: string | null;
  }>;
}

export interface ChallengeResult {
  challengeId: string;
  expiresInSeconds: number;
  destination: string;
  provider: string;
  debugCode?: string;
}

export interface TechnicianSummary {
  id: string;
  fullName: string;
}

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
  technicians: TechnicianSummary[];
}

export interface AvailabilityResponse {
  policy: {
    durationMinutes: number;
    slotIntervalMinutes: number;
    minimumLeadMinutes: number;
    maximumAdvanceDays: number;
    holdMinutes: number;
  };
  days: Array<{ date: string; slots: AvailabilitySlot[] }>;
}

export type AppointmentStatus =
  'HELD' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'EXPIRED';

export interface Appointment {
  id: string;
  source: 'ONLINE' | 'MANUAL';
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  holdExpiresAt: string | null;
  clientRescheduleCount: number;
  notes: string | null;
  technician: TechnicianSummary;
  client: {
    id: string;
    fullName: string;
    phone: string | null;
    availableCouponCount: number;
  } | null;
  guest: { name: string | null; phone: string | null } | null;
  createdAt: string;
  deposit: {
    id: string;
    reference: string;
    amountCents: number;
    status: DepositStatus;
    confirmationCode: string | null;
  } | null;
}

export type DepositStatus =
  'AWAITING_RECEIPT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface PaymentSettings {
  amountCents: number;
  recipientName: string;
  bankName: string;
  clabe: string;
  accountNumber: string | null;
  transferNotes: string;
  policyVersion: string;
  policyText: string;
}

export interface DepositPayment {
  id: string;
  appointmentId: string;
  reference: string;
  amountCents: number;
  status: DepositStatus;
  recipientName: string;
  bankName: string;
  clabe: string;
  accountNumber: string | null;
  transferNotes: string;
  receipt: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    retentionUntil: string;
  } | null;
  acceptedPolicyVersion: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  confirmationCode: string | null;
  reviewer?: TechnicianSummary | null;
  appointment: {
    id: string;
    status: AppointmentStatus;
    source: 'ONLINE' | 'MANUAL';
    clientId: string | null;
    technicianId: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    holdExpiresAt: string | null;
    notes: string | null;
    client: { id: string; fullName: string; phone: string | null; sex: Sex | null } | null;
    technician: TechnicianSummary;
  };
  createdAt: string;
}

export interface ReservationReceipt {
  folio: string;
  reference: string;
  amountCents: number;
  approvedAt: string;
  client: { id: string; fullName: string; phone: string | null } | null;
  technician: TechnicianSummary;
  startAt: string;
  durationMinutes: number;
  notice: string;
}

export interface WorkingPeriod {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface BookingPolicy {
  id: string;
  defaultDurationMinutes: number;
  slotIntervalMinutes: number;
  minimumLeadMinutes: number;
  maximumAdvanceDays: number;
  holdMinutes: number;
  rescheduleNoticeHours: number;
  clientRescheduleLimit: number;
}

export interface AppointmentListResponse {
  items: Appointment[];
  nextCursor?: string | null;
  policy?: BookingPolicy;
}

export type CalculatorOptionKind = 'TECHNIQUE' | 'LENGTH' | 'DECORATION' | 'EXTRA';

export interface CalculatorOption {
  id: string;
  kind: CalculatorOptionKind;
  code: string;
  name: string;
  description: string | null;
  iconText: string | null;
  iconObjectKey: string | null;
  priceCents: number;
  durationMinutes: number;
  pricingMode: 'FIXED' | 'PER_UNIT';
  maxQuantity: number;
  parentOptionId: string | null;
  active: boolean;
  sortOrder: number;
}

export interface CatalogImage {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
}

export interface CatalogDesign {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
  technique: string;
  nailLength: string | null;
  categories: string[];
  published: boolean;
  featured: boolean;
  sortOrder: number;
  favorite?: boolean;
  images: CatalogImage[];
}

export type QuoteStatus = 'PENDING_REVIEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface CustomQuote {
  id: string;
  status: QuoteStatus;
  noDesign: boolean;
  estimatedPriceCents: number;
  estimatedDurationMinutes: number;
  confirmedPriceCents: number | null;
  confirmedDurationMinutes: number | null;
  clientNotes: string | null;
  reviewerComments: string | null;
  priceBreakdown: Array<{ optionId: string; name: string; quantity: number; amountCents: number }>;
  client: { id: string; fullName: string; phone: string | null };
  preferredTechnician: TechnicianSummary | null;
  assignedTechnician: TechnicianSummary | null;
  reviewedBy: TechnicianSummary | null;
  selections: Array<{
    id: string;
    optionId: string;
    optionName: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  images: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
  }>;
  createdAt: string;
  reviewedAt: string | null;
}

export type CouponStatus = 'AVAILABLE' | 'REDEEMED';

export interface ClientCoupon {
  id: string;
  source: 'VISIT_REWARD' | 'PROMOTION';
  status: CouponStatus;
  title: string;
  description: string;
  iconText: string;
  rewardRuleId: string | null;
  promotionId: string | null;
  redeemedAt: string | null;
  redeemedAppointmentId: string | null;
  redeemedBy: TechnicianSummary | null;
  redeemedAppointment: { id: string; startAt: string } | null;
  createdAt: string;
}

export interface LoyaltyJourneyItem {
  id: string;
  visitNumber: number;
  title: string;
  description: string;
  iconText: string;
  state: CouponStatus | 'LOCKED';
  couponId: string | null;
}

export interface LoyaltyProfile {
  client: { id: string; fullName: string; phone: string | null };
  visitCount: number;
  availableCouponCount: number;
  journey: LoyaltyJourneyItem[];
  coupons: ClientCoupon[];
  visitHistory: Array<{
    id: string;
    delta: number;
    reason: 'APPOINTMENT_COMPLETED' | 'ADMIN_CORRECTION';
    note: string | null;
    appointment: { id: string; startAt: string } | null;
    createdBy: TechnicianSummary;
    createdAt: string;
  }>;
}

export interface RewardRule {
  id: string;
  visitNumber: number;
  title: string;
  description: string;
  iconText: string;
  active: boolean;
}

export interface Promotion {
  id: string;
  code: string;
  title: string;
  description: string;
  iconText: string;
  active: boolean;
}

export interface StudioSettings {
  id: string;
  businessName: string;
  tagline: string;
  city: string;
  state: string;
  addressLine: string | null;
  publicPhone: string | null;
  whatsapp: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  websiteUrl: string | null;
  mapUrl: string | null;
  brandVersion: number;
  hasLogo: boolean;
  hasIcon: boolean;
  updatedAt: string;
}

export interface ReportRange {
  from: string;
  to: string;
  timeZone: string;
}

export interface DashboardReport {
  range: ReportRange;
  appointments: {
    total: number;
    counts: Record<string, number>;
    attended: number;
    noShows: number;
    cancellations: number;
    upcoming: number;
  };
  deposits: {
    total: number;
    counts: Record<string, number>;
    approvedAmountCents: number;
    pendingReview: number;
  };
  clients: { new: number; frequent: ClientReportRow[] };
  designs: DesignReportRow[];
  daily: Array<{ date: string; total: number; completed: number; cancelled: number }>;
}

export interface AppointmentReportRow {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  source: 'ONLINE' | 'MANUAL';
  technician: TechnicianSummary;
  client: { id: string; fullName: string; phone: string | null } | null;
  guestName: string | null;
  guestPhone: string | null;
  design: { id: string; title: string } | null;
  notes: string | null;
  deposit: { status: DepositStatus; reference: string; amountCents: number } | null;
}

export interface DepositReportRow {
  id: string;
  appointmentId: string;
  reference: string;
  amountCents: number;
  status: DepositStatus;
  receiptUploadedAt: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  confirmationCode: string | null;
  appointment: {
    startAt: string;
    technician: TechnicianSummary;
    client: { id: string; fullName: string; phone: string | null } | null;
  };
  reviewedBy: TechnicianSummary | null;
}

export interface ClientReportRow {
  id: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
  appointmentsInRange: number;
  completedInRange: number;
  globalVisitCount: number;
}

export interface DesignReportRow {
  id: string;
  title: string;
  technique: string;
  priceCents: number;
  durationMinutes: number;
  published: boolean;
  favorites: number;
  appointmentsInRange: number;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; role: UserRole } | null;
}

interface ApiErrorBody {
  code?: string;
  message?: string | string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/backend';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as (T & ApiErrorBody) | null;
  if (!response.ok) {
    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(' ')
      : rawMessage || 'No pudimos completar la solicitud.';
    throw new ApiError(message, body?.code ?? 'REQUEST_FAILED', response.status);
  }
  return body as T;
}

export function destinationForRole(role: UserRole): string {
  if (role === 'ADMIN') return '/administracion';
  if (role === 'NAIL_TECHNICIAN') return '/agenda';
  return '/mi-cuenta';
}
