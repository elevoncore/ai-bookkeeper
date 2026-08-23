/**
 * High-performance client-side in-memory cache & request deduplication utility.
 * Prevents redundant wire requests and eliminates duplicate concurrent API calls.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

export async function fetchWithCache<T = any>(
  url: string,
  options?: RequestInit,
  ttlMs = 15000 // Default 15s TTL
): Promise<T> {
  // If not a GET request, bypass caching
  if (options && options.method && options.method !== 'GET') {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  }

  const cacheKey = url;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  if (cached && now - cached.timestamp < cached.ttl) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const requestPromise = (async () => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      memoryCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: ttlMs,
      });
      return data as T;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

export function invalidateCache(urlPattern?: string | RegExp) {
  if (!urlPattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (typeof urlPattern === 'string') {
      if (key.includes(urlPattern)) {
        memoryCache.delete(key);
      }
    } else if (urlPattern.test(key)) {
      memoryCache.delete(key);
    }
  }
}

export function setCacheData<T>(key: string, data: T, ttlMs = 15000) {
  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}
