import { normalizeManualIsbnImport } from './manual-isbn-import';

describe('catalog manual ISBN-13 import normalization', () => {
  it.each([
    '9780306406157',
    '978 0 306 40615 7',
    '978-0-306-40615-7',
    ' 978-0 306-40615 7 ',
    '9791090636071',
  ])('accepts ASCII separators only: %j', (value) => {
    expect(normalizeManualIsbnImport(value)).toBe(value.replace(/[ -]/g, ''));
  });
  it.each([
    '',
    ' - ',
    '9780306406158',
    '978030640615',
    '97803064061570',
    '4006381333931',
    '9790060115615',
    '0306406152',
    '978030640615X',
    'ISBN 9780306406157',
    '978/0306406157',
    '978.0306406157',
    '９７８０３０６４０６１５７',
    '٩٧٨٠٣٠٦٤٠٦١٥٧',
    '978\t0306406157',
    '978\n0306406157',
    '978\u00a00306406157',
    '978–0306406157',
    '9780306406157\n',
  ])('rejects without repair: %j', (value) => {
    expect(normalizeManualIsbnImport(value)).toBeNull();
  });
});
