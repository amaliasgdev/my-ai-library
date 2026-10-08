import { bookFormValue, buildBookRequest } from './book-form.helpers';
import { testBook, testBookRequest } from '../../models/book.testing';

describe('Book form mapping and request builder', () => {
  it('should map null text to empty inputs without including response-only fields', () => {
    const value = bookFormValue(testBook());
    expect(value).toEqual({
      ...testBookRequest(),
      isbn: '',
      description: '',
      publisher: '',
      coverUrl: '',
      language: '',
    });
    expect(Object.keys(value)).toHaveLength(10);
    expect(value.publicationYear).toBeNull();
  });

  it('should create a complete ten-field request and preserve informed text exactly', () => {
    const coverUrl = 'HTTPS://Images.Example.test:8443/api/covers/42-a%20b.png';
    const value = bookFormValue(
      testBook({
        coverUrl,
        isbn: '978-0132350884',
        description: ' Description\n ',
        language: 'ES',
        publisher: ' Publisher ',
        genres: [' Aventura '],
      }),
    );
    expect(buildBookRequest(value)).toEqual(
      testBookRequest({
        coverUrl,
        isbn: '978-0132350884',
        description: ' Description\n ',
        language: 'es',
        publisher: 'Publisher',
        genres: ['Aventura'],
      }),
    );
    expect(Object.keys(buildBookRequest(value))).toHaveLength(10);
  });

  it('should send cleared optional fields as null and genres as []', () => {
    const value = bookFormValue(testBook());
    value.isbn = ' ';
    value.description = ' \n ';
    value.publisher = ' ';
    value.language = ' ';
    expect(buildBookRequest(value)).toEqual(testBookRequest());
  });

  it('should copy genres rather than mutating the response', () => {
    const book = testBook({ genres: ['Aventura'] });
    const value = bookFormValue(book);
    value.genres.push('Fantasía');
    expect(book.genres).toEqual(['Aventura']);
  });
});
