export function anonymizeAddress(address: string | null | undefined): string | undefined {
  if (!address) {
    return undefined;
  }

  const trimmed = address.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const start = trimmed.slice(0, 4);
  const endLength = Math.min(6, Math.max(trimmed.length - 4, 0));
  const end = endLength > 0 ? trimmed.slice(-endLength) : '';

  if (trimmed.length <= start.length + endLength) {
    return `${start}${end}`;
  }

  return `${start}…${end}`;
}
