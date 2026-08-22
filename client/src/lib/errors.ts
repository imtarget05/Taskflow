import type { AxiosError } from 'axios';
import type { ErrorVariant } from '@/components/ui/ErrorState';

/**
 * Map a real API failure to a user-facing error category.
 *
 * Classification is based on what axios actually exposes:
 * - `error.response` absent            → network-level failure
 * - `error.response.status`            → HTTP status from our Express API
 * - `error.code === 'ECONNABORTED'`    → request timeout
 *
 * Never surface provider internals, infrastructure names, stack traces or
 * status codes to users — only the semantic variant reaches the UI.
 */
export function classifyApiError(error: unknown): ErrorVariant {
  const axiosError = error as AxiosError | undefined;
  if (!axiosError || typeof axiosError !== 'object' || !('isAxiosError' in axiosError)) {
    return 'generic';
  }

  // No response at all → connection failure / timeout / DNS.
  if (!axiosError.response) return 'network';

  switch (axiosError.response.status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 429:
      return 'rateLimited';
    case 503:
      return 'unavailable';
    default:
      if (axiosError.response.status >= 500) return 'server';
      return 'generic';
  }
}
