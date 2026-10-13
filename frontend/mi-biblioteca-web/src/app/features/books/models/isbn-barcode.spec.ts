import { isValidBarcodeIsbn13 } from './isbn-barcode';

describe('scanner ISBN-13 validation only', () => {
  it.each(['9780306406157', '9780132350884', '9791090636071'])('accepts %s', (value) =>
    expect(isValidBarcodeIsbn13(value)).toBe(true),
  );
  it.each([
    '9780306406158',
    '978030640615',
    '97803064061570',
    '978030640615X',
    ' 9780306406157',
    '9780306406157 ',
    '978-0306406157',
    '4006381333931',
    '9771234567003',
    '9790060115615',
    'https://example.test/9780306406157',
    'QR:text',
    '９７８０３０６４０６１５７',
    '',
  ])('rejects %s', (value) => expect(isValidBarcodeIsbn13(value)).toBe(false));
});
