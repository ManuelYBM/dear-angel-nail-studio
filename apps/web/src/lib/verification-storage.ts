import type { ChallengeResult } from './api';

export type StoredVerificationChallenge = Omit<ChallengeResult, 'debugCode'>;

export function verificationChallengeForStorage(
  challenge: ChallengeResult,
): StoredVerificationChallenge {
  return {
    challengeId: challenge.challengeId,
    destination: challenge.destination,
    expiresInSeconds: challenge.expiresInSeconds,
    provider: challenge.provider,
  };
}

export function parseStoredVerificationChallenge(raw: string): StoredVerificationChallenge | null {
  try {
    const stored = JSON.parse(raw) as Partial<
      StoredVerificationChallenge & { debugCode?: unknown }
    >;
    if (
      typeof stored.challengeId !== 'string' ||
      typeof stored.destination !== 'string' ||
      typeof stored.expiresInSeconds !== 'number' ||
      typeof stored.provider !== 'string'
    ) {
      return null;
    }
    return {
      challengeId: stored.challengeId,
      destination: stored.destination,
      expiresInSeconds: stored.expiresInSeconds,
      provider: stored.provider,
    };
  } catch {
    return null;
  }
}
