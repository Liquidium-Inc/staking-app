import { toast } from 'sonner';

const RETRY_PREFIX = 'Please retry or try again later.\n';

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
