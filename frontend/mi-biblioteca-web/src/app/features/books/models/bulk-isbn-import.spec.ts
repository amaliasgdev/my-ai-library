import { parseBulkIsbnImport } from './bulk-isbn-import';

const A = '9780306406157';
const B = '9788411014090';
function isbn(index: number): string {
  const prefix = '978' + String(index).padStart(9, '0');
  const sum = [...prefix].reduce(
    (total, digit, position) => total + Number(digit) * (position % 2 ? 3 : 1),
    0,
  );
  return prefix + String((10 - (sum % 10)) % 10);
}

describe('safe bulk ISBN-13 parser', () => {
  it('accepts one ISBN without inventing metadata', () => {
    const result = parseBulkIsbnImport(A);
    expect(result.error).toBeNull();
    expect(result.entries).toEqual([{ id: 0, text: A, isbn: A, ambiguous: false, occurrences: 1 }]);
  });
  it.each(['\n', '\r\n', ',', ';', ' ', '   '])('separates complete ISBN using %j', (separator) => {
    expect(parseBulkIsbnImport(A + separator + B).entries.map((entry) => entry.isbn)).toEqual([
      A,
      B,
    ]);
  });
  it.each(['978-0-306-40615-7', '978 0 306 40615 7', ' 978-0 306-40615 7 '])(
    'normalizes one candidate %j with the unchanged manual helper',
    (text) => {
      expect(parseBulkIsbnImport(text).entries[0].isbn).toBe(A);
    },
  );
  it('separates full hyphenated tokens and supports internal spaces when separated by lines', () => {
    expect(
      parseBulkIsbnImport('978-0-306-40615-7 978-84-1101-409-0').entries.map((entry) => entry.isbn),
    ).toEqual([A, B]);
    expect(
      parseBulkIsbnImport('978 0 306 40615 7\n978 84 1101 409 0').entries.map(
        (entry) => entry.isbn,
      ),
    ).toEqual([A, B]);
  });
  it.each(['978 0 306 40615 7 978 84 1101 409 0', 'ISBN 9780306406157', '9780306406157 12345'])(
    'does not guess ambiguous %j',
    (text) => {
      const entries = parseBulkIsbnImport(text).entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].ambiguous).toBe(true);
      expect(entries[0].isbn).toBeNull();
    },
  );
  it.each([
    '9780306406158',
    '4006381333931',
    '9790060115615',
    '0306406152',
    '９７８０３０６４０６１５７',
    '٩٧٨٠٣٠٦٤٠٦١٥٧',
    '978\t0306406157',
    '9780306406157\t9788411014090',
    '9780306406157\t',
    '978–0306406157',
  ])('preserves invalid %j without repair', (text) => {
    const result = parseBulkIsbnImport(text);
    expect(result.error).toBeNull();
    expect(result.entries[0].text).toBe(text);
    expect(result.entries[0].isbn).toBeNull();
  });
  it('checksum-invalid spaced ISBN remains one invalid candidate, not fragments', () => {
    const entries = parseBulkIsbnImport('978 0 306 40615 8').entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].ambiguous).toBe(false);
    expect(entries[0].isbn).toBeNull();
  });
  it('preserves invalid entries alongside valid ones and counts duplicates at first position', () => {
    const result = parseBulkIsbnImport(`${A}\nINVALID;978-0-306-40615-7,${B}\n978 0 306 40615 7`);
    expect(result.entries.map((entry) => entry.isbn)).toEqual([A, null, B]);
    expect(result.entries[0].occurrences).toBe(3);
    expect(result.entries[0].id).toBe(0);
    expect(result.entries[1].text).toBe('INVALID');
  });
  it('accepts 25 unique valid ISBN and rejects 26 without silently truncating', () => {
    expect(
      parseBulkIsbnImport(Array.from({ length: 25 }, (_, index) => isbn(index)).join('\n')).error,
    ).toBeNull();
    const result = parseBulkIsbnImport(
      Array.from({ length: 26 }, (_, index) => isbn(index)).join('\n'),
    );
    expect(result.error).toContain('25');
    expect(result.entries).toHaveLength(26);
  });
  it('25-unique limit is after canonical deduplication', () => {
    expect(parseBulkIsbnImport(Array(30).fill(A).join('\n')).entries).toHaveLength(1);
    expect(parseBulkIsbnImport(Array(30).fill(A).join('\n')).error).toBeNull();
  });
  it('100-entry bound is before deduplication, never takes the first 100 silently', () => {
    expect(parseBulkIsbnImport(Array(100).fill(A).join(';')).error).toBeNull();
    const result = parseBulkIsbnImport(Array(101).fill(A).join(';'));
    expect(result.error).toContain('100');
    expect(result.entries).toEqual([]);
  });
  it('accepts 10000 characters and rejects 10001, with no partial batch', () => {
    expect(parseBulkIsbnImport(A + ' '.repeat(10000 - A.length)).error).toBeNull();
    const result = parseBulkIsbnImport(A + ' '.repeat(10001 - A.length));
    expect(result.error).toContain('10.000');
    expect(result.entries).toEqual([]);
  });
  it.each(['', ' ', '\n,;\r\n'])('rejects empty input %j', (text) =>
    expect(parseBulkIsbnImport(text).error).not.toBeNull(),
  );
});
