const store = new Map();

// Configuration
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60; // 60 requests per minute allowed
const MAX_PENALTY_MS = 24 * 60 * 60 * 1000; // 24 hours max block

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of store.entries()) {
      if (now > data.resetTime && data.penaltyEndTime < now) {
        store.delete(key);
      }
    }
  }, 60 * 1000);
}

/**
 * Validates if the given request should be rate-limited.
 * Applies exponential backoff for repeat offenders.
 * @param {string} clientKey - Unique identifier for the client (IP or API Key)
 * @param {boolean} isInternalCli - Whether the request comes from the internal CLI
 * @returns {Object} { allowed: boolean, retryAfter: number, message: string }
 */
export function checkRateLimit(clientKey, isInternalCli = false) {
  if (isInternalCli) return { allowed: true };

  const now = Date.now();

  if (!store.has(clientKey)) {
    store.set(clientKey, {
      count: 1,
      resetTime: now + WINDOW_MS,
      penaltyEndTime: 0,
      violations: 0
    });
    return { allowed: true };
  }

  const data = store.get(clientKey);

  // 1. Check if currently in Exponential Backoff penalty box
  if (now < data.penaltyEndTime) {
    const retryAfter = Math.ceil((data.penaltyEndTime - now) / 1000);
    return { 
      allowed: false, 
      retryAfter, 
      message: "Too Many Requests. Exponential Backoff punishment active due to retry flood."
    };
  }

  // 2. Check if rate limit window expired naturally
  if (now > data.resetTime) {
    data.count = 1;
    data.resetTime = now + WINDOW_MS;
    return { allowed: true };
  }

  // 3. Increment request count for current window
  data.count++;

  // 4. Rate Limiting Trigger
  if (data.count > MAX_REQUESTS) {
    data.violations++;
    // Exponential Backoff calculation: 5s, 10s, 20s, 40s...
    let penaltyDuration = 5000 * Math.pow(2, data.violations - 1);
    if (penaltyDuration > MAX_PENALTY_MS) penaltyDuration = MAX_PENALTY_MS;

    data.penaltyEndTime = now + penaltyDuration;
    
    const retryAfter = Math.ceil(penaltyDuration / 1000);
    return { 
      allowed: false, 
      retryAfter, 
      message: `Rate limit exceeded (${MAX_REQUESTS} req/min). Exponential Backoff applied.` 
    };
  }

  return { allowed: true };
}
