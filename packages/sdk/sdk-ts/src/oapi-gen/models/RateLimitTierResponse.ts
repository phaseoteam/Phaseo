export interface RateLimitTierResponse {
  data: {
    activeUntil?: number | null;
    availableAt?: number | null;
    canRaise?: boolean;
    durationDays?: number;
    eligible?: boolean;
    refusal?: string | null;
    requestsPerMinute?: number;
    target?: string | null;
    targetRequestsPerMinute?: number | null;
    thresholds?: {
      minAgeDays?: number;
      minLifetimePaidSpendUsd?: number;
    };
    tier?: string;
  };
}
