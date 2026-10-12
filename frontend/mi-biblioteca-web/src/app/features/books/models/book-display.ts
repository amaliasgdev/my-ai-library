import { ReadingStatus } from './book.models';

export const READING_STATUS_LABELS: Readonly<Record<ReadingStatus, string>> = {
  TO_READ: 'Por leer',
  READING: 'Leyendo',
  READ: 'Leído',
  ABANDONED: 'Abandonado',
};

// LocalDate is calendar text, not a timestamp: no timezone conversion.
export function displayReadingDate(value: string | null): string {
  return value ? value.split('-').reverse().join('/') : 'Sin fecha';
}
