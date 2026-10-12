import { convertToParamMap, Params } from '@angular/router';
import {
  isCanonicalBookCatalogQuery,
  parseBookCatalogQuery,
  sameBookCatalogQuery,
  sameBookSearch,
  serializeBookCatalogQuery,
} from './book-catalog-query';

describe('book catalog URL query', () => {
  const parse = (params: Params = {}) => parseBookCatalogQuery(convertToParamMap(params));
  it('defaults to the normal title ASC list and omits all defaults', () => {
    expect(parse()).toEqual({ page: 0, size: 20, sortBy: 'title', direction: 'ASC', search: null });
    expect(serializeBookCatalogQuery(parse())).toEqual({});
  });
  it.each(['0', '1', '002', '2147483647'])('accepts page %s', (page) =>
    expect(parse({ page }).page).toBe(Number(page)),
  );
  it.each(['-1', '1.2', '1e3', ' 2', '2 ', '', '2147483648', '9999999999999999999999', ['2', '3']])(
    'defaults invalid/repeated page %j',
    (page) => expect(parse({ page }).page).toBe(0),
  );
  it.each(['10', '20', '50', '100'])('accepts size %s', (size) =>
    expect(parse({ size }).size).toBe(Number(size)),
  );
  it.each(['0', '21', '101', '999', '020', '20.0', ['10', '50']])('defaults size %j', (size) =>
    expect(parse({ size }).size).toBe(20),
  );
  it.each(['title', 'author', 'createdAt', 'readingStatus', 'rating'])(
    'accepts sort %s',
    (sortBy) => expect(parse({ sortBy }).sortBy).toBe(sortBy),
  );
  it.each(['id', 'genres', 'TITLE', ['author', 'rating']])('defaults sort %j', (sortBy) =>
    expect(parse({ sortBy }).sortBy).toBe('title'),
  );
  it.each(['ASC', 'DESC'])('accepts direction %s', (direction) =>
    expect(parse({ direction }).direction).toBe(direction),
  );
  it.each(['asc', 'desc', 'down', 'up', ['ASC', 'DESC']])('defaults direction %j', (direction) =>
    expect(parse({ direction }).direction).toBe('ASC'),
  );
  it('trims title and author and combines them', () =>
    expect(parse({ title: ' Dune ', author: ' Herbert ' }).search).toEqual({
      title: 'Dune',
      author: 'Herbert',
    }));
  it('accepts exact maximum text lengths without truncation', () =>
    expect(parse({ title: 't'.repeat(255), author: 'a'.repeat(255) }).search).toEqual({
      title: 't'.repeat(255),
      author: 'a'.repeat(255),
    }));
  it('discards overlong, blank or repeated text independently', () => {
    expect(parse({ title: 't'.repeat(256), author: 'Valid' }).search).toEqual({ author: 'Valid' });
    expect(parse({ title: 'Valid', author: 'a'.repeat(256) }).search).toEqual({ title: 'Valid' });
    expect(parse({ title: '  ', author: '\t' }).search).toBeNull();
    expect(parse({ title: ['a', 'b'], author: 'Valid' }).search).toEqual({ author: 'Valid' });
    expect(parse({ author: ['a', 'b'] }).search).toBeNull();
  });
  it.each(['9780306406157', '978-0-306-40615-7', '123456789X', '1234567890'])(
    'accepts CRUD ISBN syntax %s without checksum validation',
    (isbn) => expect(parse({ isbn: ` ${isbn} ` }).search).toEqual({ isbn }),
  );
  it.each(['INVALID', '123', '9'.repeat(21), ['9780306406157', '123456789X'], '   '])(
    'discards invalid/repeated ISBN %j and retains valid title/author',
    (isbn) =>
      expect(parse({ isbn, title: 'Dune', author: 'Herbert' }).search).toEqual({
        title: 'Dune',
        author: 'Herbert',
      }),
  );
  it('gives valid ISBN priority and removes conflicting title/author', () =>
    expect(parse({ isbn: '9780306406157', title: 'Dune', author: 'Herbert' }).search).toEqual({
      isbn: '9780306406157',
    }));
  it('uses normal list when all criteria are invalid', () =>
    expect(parse({ isbn: 'bad', title: 'a'.repeat(256) }).search).toBeNull());
  it('serializes deterministically and round trips without defaults', () => {
    const query = parse({
      author: 'Herbert',
      title: 'Dune',
      direction: 'DESC',
      sortBy: 'rating',
      size: '50',
      page: '3',
    });
    const params = serializeBookCatalogQuery(query);
    expect(Object.keys(params)).toEqual(['page', 'size', 'sortBy', 'direction', 'title', 'author']);
    expect(parse(params)).toEqual(query);
    expect(serializeBookCatalogQuery(parse(params))).toEqual(params);
    expect(sameBookCatalogQuery(query, parse(params))).toBe(true);
    expect(sameBookSearch(null, { title: 'Dune' })).toBe(false);
  });
  it('compares by keys/values regardless of order, rejecting defaults, unknowns and repetitions', () => {
    const query = parse({ page: '2', title: 'Dune' });
    expect(
      isCanonicalBookCatalogQuery(convertToParamMap({ title: 'Dune', page: '2' }), query),
    ).toBe(true);
    for (const params of [
      { page: '2', title: 'Dune', size: '20' },
      { page: '2', title: 'Dune', foo: 'bar' },
      { page: ['2', '2'], title: 'Dune' },
      { page: '02', title: 'Dune' },
    ])
      expect(isCanonicalBookCatalogQuery(convertToParamMap(params), query)).toBe(false);
    expect(serializeBookCatalogQuery(parse({ foo: 'bar' }))).toEqual({});
  });
});
