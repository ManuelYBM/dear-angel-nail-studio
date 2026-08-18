export interface QuoteAccessRecord {
  status: string;
  assignedTechnicianId: string | null;
  preferredTechnicianId: string | null;
}

export function canTechnicianAccessQuote(technicianId: string, quote: QuoteAccessRecord): boolean {
  return (
    quote.assignedTechnicianId === technicianId ||
    (quote.status === 'PENDING_REVIEW' &&
      quote.assignedTechnicianId === null &&
      (quote.preferredTechnicianId === null || quote.preferredTechnicianId === technicianId))
  );
}
