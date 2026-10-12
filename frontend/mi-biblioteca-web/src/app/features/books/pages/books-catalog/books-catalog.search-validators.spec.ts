import { FormControl, FormGroup, Validators } from '@angular/forms';
import { searchCriteriaValidator, searchIsbnValidator } from './books-catalog.search-validators';

describe('Catalog search validation', () => {
  function form(title = '', author = '', isbn = '') {
    return new FormGroup(
      {
        title: new FormControl(title, Validators.maxLength(255)),
        author: new FormControl(author, Validators.maxLength(255)),
        isbn: new FormControl(isbn, [Validators.maxLength(20), searchIsbnValidator]),
      },
      searchCriteriaValidator,
    );
  }

  it('should require at least one nonblank criterion', () => {
    expect(form().hasError('noCriteria')).toBe(true);
    expect(form('  ', ' ', ' ').hasError('noCriteria')).toBe(true);
  });

  it('should accept title and author separately or together', () => {
    expect(form('Dune').valid).toBe(true);
    expect(form('', 'Herbert').valid).toBe(true);
    expect(form('Dune', 'Herbert').valid).toBe(true);
  });

  it.each([
    ['Dune', ''],
    ['', 'Herbert'],
    ['Dune', 'Herbert'],
  ])('should reject ISBN combined with title=%s author=%s', (title, author) => {
    expect(form(title, author, '9780306406157').hasError('exclusiveIsbn')).toBe(true);
  });

  it.each(['9780306406157', '978-0-306-40615-7', '0 306 40615 2', '123456789x', '9780306406158'])(
    'should accept CRUD ISBN syntax without checksum: %s',
    (isbn) => {
      expect(form('', '', isbn).valid).toBe(true);
    },
  );

  it.each(['abc', '123', '9780306406157 ', ' 9780306406157', '978/0306406157'])(
    'should reject syntax the backend DTO rejects: %s',
    (isbn) => {
      expect(form('', '', isbn).controls.isbn.hasError('isbn')).toBe(true);
    },
  );

  it('should enforce backend maximum lengths', () => {
    expect(form('a'.repeat(255), 'a'.repeat(255)).valid).toBe(true);
    expect(form('a'.repeat(256)).controls.title.hasError('maxlength')).toBe(true);
    expect(form('', 'a'.repeat(256)).controls.author.hasError('maxlength')).toBe(true);
    expect(form('', '', '1'.repeat(20)).valid).toBe(true);
    expect(form('', '', '1'.repeat(21)).controls.isbn.hasError('maxlength')).toBe(true);
  });
});
