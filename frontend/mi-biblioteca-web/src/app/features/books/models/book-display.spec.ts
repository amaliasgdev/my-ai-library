import { displayReadingDate, READING_STATUS_LABELS } from './book-display';
describe('book display', () => {
  it('provides readable labels for all statuses', () =>
    expect(READING_STATUS_LABELS).toEqual({
      TO_READ: 'Por leer',
      READING: 'Leyendo',
      READ: 'Leído',
      ABANDONED: 'Abandonado',
    }));
  it.each([
    ['2026-01-01', '01/01/2026'],
    ['2024-02-29', '29/02/2024'],
    ['0099-12-31', '31/12/0099'],
    [null, 'Sin fecha'],
  ])('formats calendar text %s without timezone conversion', (value, expected) =>
    expect(displayReadingDate(value)).toBe(expected),
  );
});
