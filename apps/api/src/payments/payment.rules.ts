export function canUploadReceipt(status: string, holdExpiresAt: Date | null, now = new Date()) {
  return status === 'HELD' && Boolean(holdExpiresAt && holdExpiresAt.getTime() > now.getTime());
}

export function canReviewDeposit(depositStatus: string, appointmentStatus: string) {
  return depositStatus === 'PENDING_REVIEW' && appointmentStatus === 'PENDING_PAYMENT';
}

export function confirmationCode(reference: string) {
  return `RES-${reference.replace(/^DA-/, '')}`;
}

export function paymentReviewActionUrl(decision: 'APPROVED' | 'REJECTED', appointmentId: string) {
  return decision === 'APPROVED' ? '/agenda' : `/anticipo?appointmentId=${appointmentId}`;
}
