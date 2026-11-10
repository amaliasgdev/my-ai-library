import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { BooksService } from '../../services/books.service';
import { MetadataWorks } from '../../models/book-metadata.models';
import {
  MetadataDuplicates,
  MetadataEdition,
  MetadataWork,
  normalizedMetadataIsbn,
} from '../../models/book-metadata.models';
import { PhotoMetadataCandidate } from './photo-metadata-candidate';

describe('PhotoMetadataCandidate', () => {
  let fixture: ComponentFixture<PhotoMetadataCandidate>;
  let page: PhotoMetadataCandidate;
  let http: HttpTestingController;
  const work: MetadataWork = {
    workKey: '/works/OL1W',
    title: 'Dune',
    authors: ['Frank Herbert'],
    coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
    firstPublicationYear: 1965,
    editionCount: 20,
  };
  const metadata = {
    isbn: null,
    title: 'Dune edition',
    author: 'Frank Herbert',
    publisher: 'Publisher',
    publicationYear: 2001,
    pageCount: 400,
    language: 'en',
    genres: ['Fiction'],
    coverUrl: 'https://covers.openlibrary.org/b/id/2-L.jpg',
  };
  const edition: MetadataEdition = {
    editionKey: '/books/OL1M',
    isbns: ['9780132350884', '0132350882'],
    metadata,
  };
  const duplicates: MetadataDuplicates = {
    originalIsbn: null,
    normalizedIsbn: null,
    validIsbn: false,
    equivalentIsbns: [],
    matches: [],
    truncated: false,
    similarityChecked: true,
  };
  const isDuplicate = (request: { url: string }) => request.url.endsWith('/metadata-duplicates');
  const isSearch = (request: { url: string }) => request.url.endsWith('/metadata-search');
  const isEditions = (request: { url: string }) => request.url.endsWith('/metadata-editions');
  const isLookup = (request: { url: string }) => request.url.endsWith('/isbn-lookup');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PhotoMetadataCandidate],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PhotoMetadataCandidate);
    fixture.componentRef.setInput('observation', {
      id: '1',
      title: 'Dune',
      author: 'Frank Herbert',
      rawIsbn: null,
      visibleText: 'DUNE / HERBERT',
      legibility: 'CLEAR',
      warnings: [],
    });
    page = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  function searchWorks(): void {
    page.search();
    const search = http.expectOne(isSearch);
    expect(search.request.params.get('title')).toBe('Dune');
    expect(search.request.params.get('author')).toBe('Frank Herbert');
    expect(search.request.body).toBeNull();
    http.expectOne(isDuplicate).flush(duplicates);
    search.flush({
      content: [work, { ...work, workKey: '/works/OL2W', title: 'Dune Messiah' }],
      truncated: true,
    });
    fixture.detectChanges();
  }

  it('keeps original evidence and simulation labels without HTTP until explicit search', () => {
    expect(fixture.nativeElement.textContent).toContain('ejemplo simulado');
    expect(fixture.nativeElement.textContent).toContain('DUNE / HERBERT');
    expect(page.form.controls.title.value).toBe('Dune');
    http.expectNone(() => true);
  });

  it('shows multiple works and distinct first-publication year without assigning an ISBN', () => {
    searchWorks();
    expect(page.selected()).toBeNull();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Dune Messiah');
    expect(text).toContain('Primera publicación: 1965');
    expect(text).toContain('no es el año de edición');
    expect(text).toContain('hasta 10 obras');
  });

  it('chooses work then edition and requires an explicit ISBN selection before exact duplicate checking', () => {
    searchWorks();
    page.chooseWork(work);
    http.expectOne(isDuplicate).flush(duplicates);
    const editions = http.expectOne(isEditions);
    expect(editions.request.params.get('workKey')).toBe('/works/OL1W');
    expect(editions.request.params.get('page')).toBe('0');
    editions.flush({ workKey: work.workKey, page: 0, content: [edition], hasNext: true });
    page.chooseEdition(edition);
    expect(page.selected()?.isbn).toBeNull();
    expect(page.selected()?.publicationYear).toBe(2001);
    expect(http.expectOne(isDuplicate).request.params.has('isbn')).toBe(false);
    page.selectIsbn('0132350882');
    const check = http.expectOne(isDuplicate);
    expect(check.request.params.get('isbn')).toBe('0132350882');
    check.flush({
      ...duplicates,
      validIsbn: true,
      equivalentIsbns: ['0132350882', '9780132350884'],
      matches: [
        { id: 1, title: 'Dune', author: 'Herbert', isbn: '9780132350884', kind: 'EQUIVALENT_ISBN' },
        { id: 2, title: 'Dune', author: 'Herbert', isbn: null, kind: 'POSSIBLE_TITLE_AUTHOR' },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ISBN-10/ISBN-13 equivalente');
    expect(fixture.nativeElement.textContent).toContain('puede ser otra edición');
    expect(fixture.nativeElement.textContent).toContain('Año de edición: 2001');
    page.selectIsbn('invented');
    http.expectNone(isDuplicate);
  });

  it.each(['9780132350884', '0-13-235088-2', '080442957X'])(
    'reuses existing lookup for valid ISBN %s while preserving original evidence',
    (raw) => {
      page.form.controls.isbn.setValue(raw);
      page.search();
      const lookup = http.expectOne(isLookup);
      expect(lookup.request.params.get('isbn')).toBe(normalizedMetadataIsbn(raw));
      expect(http.expectOne(isDuplicate).request.params.get('isbn')).toBe(raw);
      lookup.flush({ ...metadata, isbn: normalizedMetadataIsbn(raw) });
      http.expectOne(isDuplicate).flush({ ...duplicates, originalIsbn: raw, validIsbn: true });
      expect(page.selected()?.isbn).toBe(normalizedMetadataIsbn(raw));
      expect(page.form.controls.isbn.value).toBe(raw);
      http.expectNone(isSearch);
    },
  );

  it('invalid ISBN falls back to entered text without repairing digits', () => {
    page.form.controls.isbn.setValue('9780132350885');
    page.search();
    http.expectOne(isSearch).flush({ content: [], truncated: false });
    http.expectOne(isDuplicate).flush({ ...duplicates, originalIsbn: '9780132350885' });
    fixture.detectChanges();
    expect(page.notice()).toContain('ISBN inválido');
    expect(fixture.nativeElement.textContent).toContain('No se encontraron obras');
    expect(page.form.controls.isbn.value).toBe('9780132350885');
    http.expectNone(isLookup);
  });

  it('allows explicit title search after ISBN lookup not found', () => {
    page.form.controls.isbn.setValue('0132350882');
    page.search();
    http.expectOne(isDuplicate).flush(duplicates);
    http.expectOne(isLookup).flush({}, { status: 404, statusText: 'Not Found' });
    expect(page.error()).toContain('No se encontró');
    page.searchText();
    http.expectOne(isSearch).flush({ content: [], truncated: false });
    http.expectOne(isDuplicate).flush(duplicates);
  });

  it('editing invalidates results, duplicate checks and active requests without another HTTP call', () => {
    page.search();
    const request = http.expectOne(isSearch);
    const check = http.expectOne(isDuplicate);
    page.form.controls.title.setValue('Changed');
    expect(request.cancelled).toBe(true);
    expect(check.cancelled).toBe(true);
    expect(page.works()).toBeNull();
    expect(page.duplicateState()).toBe('idle');
    expect(page.selected()).toBeNull();
    expect(page.loading()).toBe(false);
    http.expectNone(() => true);
  });

  it('cancels obsolete edition searches and never reuses previous selections', () => {
    searchWorks();
    page.chooseWork(work);
    const editions = http.expectOne(isEditions);
    const check = http.expectOne(isDuplicate);
    page.cancel();
    expect(editions.cancelled).toBe(true);
    expect(check.cancelled).toBe(true);
    expect(page.work()).toBeNull();
    expect(page.duplicates()).toBeNull();
    http.expectNone(() => true);
  });

  it('keeps duplicate failures unknown and retries only on explicit action', () => {
    page.search();
    http.expectOne(isSearch).flush({ content: [], truncated: false });
    http.expectOne(isDuplicate).flush({}, { status: 500, statusText: 'Failure' });
    fixture.detectChanges();
    expect(page.duplicateState()).toBe('unknown');
    expect(fixture.nativeElement.textContent).toContain('no significa que el libro sea nuevo');
    page.retryDuplicates();
    http.expectOne(isDuplicate).flush(duplicates);
    expect(page.duplicateState()).toBe('known');
  });

  it.each([0, 400, 502, 503, 504])(
    'shows safe independent error %s without automatic retries',
    (status) => {
      page.search();
      http.expectOne(isDuplicate).flush(duplicates);
      const request = http.expectOne(isSearch);
      if (status === 0) request.error(new ProgressEvent('error'));
      else
        request.flush(
          { detail: 'SECRET UPSTREAM' },
          { status, statusText: 'Failure', headers: { 'Retry-After': '60' } },
        );
      expect(page.loading()).toBe(false);
      expect(page.error()).not.toContain('SECRET');
      if (status === 503) expect(page.error()).toContain('60 segundos');
      http.expectNone(() => true);
    },
  );

  it('supports empty editions and manual continuation without writes', () => {
    searchWorks();
    page.chooseWork(work);
    http.expectOne(isDuplicate).flush(duplicates);
    http
      .expectOne(isEditions)
      .flush({ workKey: work.workKey, page: 0, content: [], hasNext: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se encontraron ediciones');
    page.useManual();
    http.expectOne(isDuplicate).flush(duplicates);
    expect(page.manual()).toBe(true);
    expect(page.form.controls.title.value).toBe('Dune');
    http.expectNone((request) => request.method !== 'GET');
  });

  it('paginates editions within bounds and removes stale selection and duplicate state', () => {
    searchWorks();
    page.chooseWork(work);
    http.expectOne(isDuplicate).flush(duplicates);
    http
      .expectOne(isEditions)
      .flush({ workKey: work.workKey, page: 0, content: [edition], hasNext: true });
    page.loadEditions(1);
    const request = http.expectOne(isEditions);
    expect(request.request.params.get('page')).toBe('1');
    expect(page.editions()).toBeNull();
    expect(page.duplicates()).toBeNull();
    request.flush({ workKey: work.workKey, page: 1, content: [], hasNext: false });
    page.loadEditions(10);
    http.expectNone(isEditions);
  });

  it('uses lazy covers unchanged and falls back on failed image', () => {
    searchWorks();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(work.coverUrl);
    expect(image.getAttribute('loading')).toBe('lazy');
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin portada');
  });

  it('rejects invalid identification text locally', () => {
    page.form.controls.title.setValue('a'.repeat(256));
    page.search();
    expect(page.error()).toContain('longitudes');
    http.expectNone(() => true);
    page.form.setValue({ title: '', author: '', isbn: 'invalid' });
    page.search();
    expect(page.error()).toContain('ISBN inválido');
    http.expectNone(() => true);
  });

  it('destroys pending requests and preserves independent candidate state', () => {
    page.search();
    const search = http.expectOne(isSearch);
    const check = http.expectOne(isDuplicate);
    fixture.destroy();
    expect(search.cancelled).toBe(true);
    expect(check.cancelled).toBe(true);
  });

  it('rejects late results from a cancelled search after a new identification is submitted', () => {
    const oldResults = new Subject<MetadataWorks>();
    const newResults = new Subject<MetadataWorks>();
    vi.spyOn(TestBed.inject(BooksService), 'searchMetadata')
      .mockReturnValueOnce(oldResults)
      .mockReturnValueOnce(newResults);
    page.search();
    const oldCheck = http.expectOne(isDuplicate);
    page.form.controls.title.setValue('New identification');
    expect(oldCheck.cancelled).toBe(true);
    page.search();
    http.expectOne(isDuplicate).flush(duplicates);
    newResults.next({ content: [{ ...work, title: 'New identification' }], truncated: false });
    newResults.complete();
    oldResults.next({ content: [work], truncated: false });
    oldResults.complete();
    expect(page.works()?.content[0].title).toBe('New identification');
  });

  it('retries catalog checks with the chosen work criteria, not unrelated draft inputs', () => {
    searchWorks();
    const other = { ...work, title: 'Different edition work', authors: ['Other author'] };
    page.chooseWork(other);
    http
      .expectOne(isEditions)
      .flush({ workKey: other.workKey, page: 0, content: [], hasNext: false });
    http.expectOne(isDuplicate).flush({}, { status: 500, statusText: 'Failure' });
    page.retryDuplicates();
    const retry = http.expectOne(isDuplicate);
    expect(retry.request.params.get('title')).toBe(other.title);
    expect(retry.request.params.get('author')).toBe('Other author');
    retry.flush(duplicates);
  });

  it('keeps corrections and selections independent between observations', () => {
    const other = TestBed.createComponent(PhotoMetadataCandidate);
    other.componentRef.setInput('observation', {
      id: '2',
      title: 'Another book',
      author: null,
      rawIsbn: null,
      visibleText: 'OTHER',
      legibility: 'PARTIAL',
      warnings: [],
    });
    other.detectChanges();
    page.form.controls.title.setValue('Corrected Dune');
    expect(other.componentInstance.form.controls.title.value).toBe('Another book');
    expect(other.componentInstance.selected()).toBeNull();
    http.expectNone(() => true);
    other.destroy();
  });
});

describe('metadata ISBN checksum (scanner unchanged)', () => {
  it.each(['0132350882', '9780132350884', '080442957X', '9791090636071'])('accepts %s', (value) =>
    expect(normalizedMetadataIsbn(value)).toBe(value),
  );
  it.each(['9780132350885', '0132350883', '978013235088X', '９780132350884', '978O132350884'])(
    'rejects without guessing %s',
    (value) => expect(normalizedMetadataIsbn(value)).toBeNull(),
  );
});
