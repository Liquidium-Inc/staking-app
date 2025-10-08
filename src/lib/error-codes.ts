/**
 * Shared error codes for broadcast service errors
 * These codes provide stable identifiers that can be used across frontend and backend
 * without depending on error message strings.
 */

export const BROADCAST_ERROR_CODES = {
  // RBF (Replace-by-Fee) related errors
  INSUFFICIENT_FEE_FOR_REPLACEMENT: 'INSUFFICIENT_FEE_FOR_REPLACEMENT',

  // Fee rate errors
  MIN_RELAY_FEE_NOT_MET: 'MIN_RELAY_FEE_NOT_MET',
  MEMPOOL_MIN_FEE_NOT_MET: 'MEMPOOL_MIN_FEE_NOT_MET',
  INSUFFICIENT_FEE: 'INSUFFICIENT_FEE',

  // Mempool errors
  ALREADY_IN_MEMPOOL: 'ALREADY_IN_MEMPOOL',

  // Generic broadcast failure
  BROADCAST_FAILED: 'BROADCAST_FAILED',
} as const;

export type BroadcastErrorCode = (typeof BROADCAST_ERROR_CODES)[keyof typeof BROADCAST_ERROR_CODES];

/**
 * Error code mappings for common mempool error patterns
 */
export const MEMPOOL_ERROR_PATTERNS = {
  // Order matters: more specific patterns first to avoid partial matches
  'insufficient fee, rejecting replacement': BROADCAST_ERROR_CODES.INSUFFICIENT_FEE_FOR_REPLACEMENT,
  'mempool min fee not met': BROADCAST_ERROR_CODES.MEMPOOL_MIN_FEE_NOT_MET,
  'min relay fee not met': BROADCAST_ERROR_CODES.MIN_RELAY_FEE_NOT_MET,
  'already in mempool': BROADCAST_ERROR_CODES.ALREADY_IN_MEMPOOL,
  'insufficient fee': BROADCAST_ERROR_CODES.INSUFFICIENT_FEE,
} as const;

/**
 * User-friendly error messages mapped to error codes
 */
export const ERROR_CODE_MESSAGES = {
  [BROADCAST_ERROR_CODES.INSUFFICIENT_FEE_FOR_REPLACEMENT]:
    'RBF rejected, please wait until your pending transactions confirm.',

  [BROADCAST_ERROR_CODES.MIN_RELAY_FEE_NOT_MET]:
    'Transaction fee rate is too low to be relayed by the network. Please increase the fee rate and try again.',

  [BROADCAST_ERROR_CODES.MEMPOOL_MIN_FEE_NOT_MET]:
    'Transaction fee rate is below the current mempool minimum. The network is congested - please increase the fee rate and try again.',

  [BROADCAST_ERROR_CODES.INSUFFICIENT_FEE]:
    'Transaction fee is insufficient for current network conditions. Please increase the fee rate and try again.',

  [BROADCAST_ERROR_CODES.ALREADY_IN_MEMPOOL]:
    'Transaction already exists in mempool. Please wait for confirmation.',

  [BROADCAST_ERROR_CODES.BROADCAST_FAILED]: 'Transaction broadcast failed.',
} as const;

/**
 * Format a user-friendly error message, optionally enriching with details from the raw error.
 */
export function formatBroadcastErrorMessage(code: BroadcastErrorCode, _rawError?: string): string {
  return ERROR_CODE_MESSAGES[code] ?? ERROR_CODE_MESSAGES[BROADCAST_ERROR_CODES.BROADCAST_FAILED];
}
