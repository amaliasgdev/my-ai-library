/** Physical labels are text, not stable shelf identities. Keep validation before trimming. */
export const LOCATION_LIMITS = { room: 100, bookcase: 100, shelf: 50 } as const;

export function isLocationLabel(value: string): boolean {
  return !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value);
}
