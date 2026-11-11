/**
 * Visual density of the catalog grid: the *maximum* number of columns wanted. The grid drops
 * columns when they do not fit. In-memory preference only (no storage, URL or HTTP).
 */
export type CardsPerRow = 'auto' | 2 | 3 | 4 | 5 | 6 | 8 | 10;

export const CARDS_PER_ROW_OPTIONS: readonly { value: CardsPerRow; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 2, label: '2 tarjetas por fila' },
  { value: 3, label: '3 tarjetas por fila' },
  { value: 4, label: '4 tarjetas por fila' },
  { value: 5, label: '5 tarjetas por fila' },
  { value: 6, label: '6 tarjetas por fila' },
  { value: 8, label: '8 tarjetas por fila' },
  { value: 10, label: '10 tarjetas por fila' },
];

/** From this many columns the full card has too many controls: a compact card is used. */
export const COMPACT_CARDS_FROM = 8;

export function isCardsPerRow(value: unknown): value is CardsPerRow {
  return CARDS_PER_ROW_OPTIONS.some((option) => option.value === value);
}

export function isCompactCardsPerRow(value: CardsPerRow): boolean {
  return value !== 'auto' && value >= COMPACT_CARDS_FROM;
}
