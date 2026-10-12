import { localDateString, parseLocalDate } from './reading-date';

describe('local reading dates', () => {
  it.each(['2024-02-29', '2026-10-12', '0000-02-29', '0004-02-29', '0099-12-31', '2100-01-01'])(
    'should round-trip %s using local calendar components',
    (value) => {
      const date = parseLocalDate(value)!;
      const [year, month, day] = value.split('-').map(Number);
      expect(date.getFullYear()).toBe(year);
      expect(date.getMonth()).toBe(month - 1);
      expect(date.getDate()).toBe(day);
      expect(localDateString(date)).toBe(value);
    },
  );
  it.each([
    '2023-02-29',
    '2024-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-01-00',
    '2026-1-01',
    '12/10/2026',
    'invalid',
  ])('should reject invalid calendar date %s', (value) => expect(parseLocalDate(value)).toBeNull());
  it('should serialize local components rather than the UTC calendar date', () => {
    const date = new Date(2026, 9, 12, 0, 5);
    const iso = vi.spyOn(date, 'toISOString').mockImplementation(() => {
      throw new Error('UTC forbidden');
    });
    expect(localDateString(date)).toBe('2026-10-12');
    expect(iso).not.toHaveBeenCalled();
  });
});
