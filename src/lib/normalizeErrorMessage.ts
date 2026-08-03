import { toast } from 'sonner';

const RETRY_PREFIX = 'Please retry or try again later.\n';

const collectStrings = (value: unknown): string[] => {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
  return [];
};

export function getApiErrorMessage(responseData: unknown, fallback: string): string {
  const errorValue =
    responseData && typeof responseData === 'object' && 'error' in responseData
      ? responseData.error
      : responseData;
  const messages = [...new Set(collectStrings(errorValue))];
  return messages.length > 0 ? messages.join(', ') : fallback;
}

export function normalizeErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return `${RETRY_PREFIX}Unknown error.`;

  const baseMessage =
    trimmed.toLowerCase() === 'internal server error'
      ? 'Internal server error'
      : trimmed.replace(RETRY_PREFIX, '').trim();

  const messageBody = baseMessage || 'Unknown error';
  const normalized = messageBody.endsWith('.') ? messageBody : `${messageBody}.`;

  return `${RETRY_PREFIX}${normalized}`;
}

type ToastErrorFn = (typeof toast)['error'];
type ToastErrorOptionsBase = NonNullable<Parameters<ToastErrorFn>[1]>;

export interface ErrorToastOptions extends ToastErrorOptionsBase {
  appendRetryMessage?: boolean;
}

export function showErrorToast(message: string, options?: ErrorToastOptions) {
  const { appendRetryMessage = true, style, ...toastOptions } = options ?? {};
  const text = appendRetryMessage
    ? normalizeErrorMessage(message)
    : message.trim() || 'Unknown error';

  const mergedStyle =
    appendRetryMessage && (style?.whiteSpace ?? true)
      ? { whiteSpace: 'pre-line', ...style }
      : style;

  toast.error(text, { ...toastOptions, style: mergedStyle });
}
