import { parseBookId } from './book-id';
describe('parseBookId', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['00042', 42],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('accepts %s', (value, id) => expect(parseBookId(value)).toBe(id));
  it.each([
    null,
    '',
    '0',
    '000',
    '-1',
    '+1',
    'new',
    '1a',
    ' 1',
    '1 ',
    '1\n',
    '1.5',
    '1.0',
    '1e3',
    '9007199254740992',
    '999999999999999999999999',
  ])('rejects %s', (value) => expect(parseBookId(value)).toBeNull());
});
