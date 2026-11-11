import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BooksService } from './books.service';
import { testBookPage } from '../models/book.testing';

describe('BooksService shared filter serialization', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it.each(['list', 'search'])('%s sends repeated states and shared scalar filters', (mode) => {
    const service = TestBed.inject(BooksService);
    const filters = {
      readingStatus: ['READ', 'READING'] as ('READ' | 'READING')[],
      ratingMin: 4,
      yearFrom: 2020,
      yearTo: 2021,
      genre: [' Terror ', 'Fantasía', 'terror'],
      genreUnassigned: true,
      language: ' ES ',
      publisher: '100%_Press',
    };
    (mode === 'list'
      ? service.getBooks({ page: 2, sortBy: 'author' }, filters)
      : service.searchBooks({ title: 'Dune' }, { page: 2, sortBy: 'author' }, filters)
    ).subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne(
      (request) => request.url === (mode === 'list' ? '/api/books' : '/api/books/search'),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.getAll('readingStatus')).toEqual(['READING', 'READ']);
    expect(req.request.params.getAll('genre')).toEqual(['Fantasía', 'Terror']);
    expect(req.request.params.get('genreUnassigned')).toBe('true');
    for (const [key, value] of Object.entries({
      ratingMin: '4',
      yearFrom: '2020',
      yearTo: '2021',
      language: 'es',
      publisher: '100%_Press',
      page: '2',
      sortBy: 'author',
    }))
      expect(req.request.params.get(key)).toBe(value);
    expect(req.request.params.has('title')).toBe(mode === 'search');
    req.flush(testBookPage());
  });
  it.each(['list', 'search'])('%s omits empty filter values', (mode) => {
    const service = TestBed.inject(BooksService);
    const filters = {
      readingStatus: [],
      genre: [' '],
      genreUnassigned: false,
      publisher: '',
      language: '',
      ratingMin: undefined,
    };
    (mode === 'list'
      ? service.getBooks({}, filters)
      : service.searchBooks({ author: 'Herbert' }, {}, filters)
    ).subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne(
      (request) => request.method === 'GET',
    );
    for (const key of [
      'readingStatus',
      'ratingMin',
      'yearFrom',
      'yearTo',
      'genre',
      'genreUnassigned',
      'language',
      'publisher',
    ])
      expect(req.request.params.has(key)).toBe(false);
    req.flush(testBookPage());
  });
  it('gets distinct genres from the dedicated catalog endpoint', () => {
    const service = TestBed.inject(BooksService);
    service.getGenres().subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/books/genres');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(['Fantasía', 'Terror']);
  });
});
