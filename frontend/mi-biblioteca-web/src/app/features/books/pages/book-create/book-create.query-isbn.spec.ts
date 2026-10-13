import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap, Params, provideRouter, Router } from '@angular/router';
import { testBookLookup } from '../../models/book.testing';
import { BookCreate } from './book-create';

describe('BookCreate consumable ISBN URL seed', () => {
  let fixture: ComponentFixture<BookCreate>;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  const isbn = '9780306406157';
  const route = { snapshot: { queryParamMap: convertToParamMap({}) } };
  beforeEach(() => {
    route.snapshot.queryParamMap = convertToParamMap({});
    TestBed.configureTestingModule({
      imports: [BookCreate],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(() => {
      route.snapshot.queryParamMap = convertToParamMap({});
      return Promise.resolve(true);
    });
  });
  afterEach(() => {
    fixture?.destroy();
    http.verify();
  });
  async function create(params: Params = {}) {
    route.snapshot.queryParamMap = convertToParamMap(params);
    fixture = TestBed.createComponent(BookCreate);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }
  function lookup() {
    return http.expectOne((request) => request.url === '/api/books/isbn-lookup');
  }
  it('normal /books/new is empty and makes no request or cleanup navigation', async () => {
    const page = await create();
    expect(page.editor().form.controls.isbn.value).toBe('');
    http.expectNone((request) => request.method === 'GET');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('waits for the rendered form, fills valid ISBN dirty/untouched and starts exactly one lookup', async () => {
    route.snapshot.queryParamMap = convertToParamMap({ isbn });
    fixture = TestBed.createComponent(BookCreate);
    http.expectNone((request) => request.method === 'GET');
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const control = page.editor().form.controls.isbn;
    expect(control.value).toBe(isbn);
    expect(control.dirty).toBe(true);
    expect(control.untouched).toBe(true);
    expect(page.detectedIsbn()).toBe(isbn);
    const request = lookup();
    expect(request.request.params.get('isbn')).toBe(isbn);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/books/new'], { replaceUrl: true });
    expect(route.snapshot.queryParamMap.has('isbn')).toBe(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(request.cancelled).toBe(false);
    http.expectNone((request) => request.method === 'GET');
    request.flush(testBookLookup({ isbn }));
    http.expectNone((request) => request.method === 'POST');
  });
  it.each([
    '',
    '9780306406158',
    '4006381333931',
    '978-0306406157',
    ' 9780306406157',
    '9780306406157 ',
    '9790060115615',
  ])('does not consume or repair invalid value %j', async (value) => {
    const page = await create({ isbn: value });
    expect(page.editor().form.controls.isbn.value).toBe('');
    http.expectNone((request) => request.method === 'GET');
    expect(navigate).not.toHaveBeenCalled();
    expect(route.snapshot.queryParamMap.get('isbn')).toBe(value);
  });
  it('rejects repeated ISBN even when both values are valid and identical', async () => {
    const page = await create({ isbn: [isbn, isbn] });
    expect(page.editor().form.controls.isbn.value).toBe('');
    http.expectNone((request) => request.method === 'GET');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('lookup error retains editable ISBN and its message; manual edit clears it', async () => {
    const page = await create({ isbn });
    lookup().flush({}, { status: 404, statusText: 'Not Found' });
    expect(page.editor().form.controls.isbn.value).toBe(isbn);
    expect(page.editor().form.controls.isbn.enabled).toBe(true);
    expect(page.detectedIsbn()).toBe(isbn);
    expect(page.lookupState()).toBe('error');
    page.editor().form.controls.isbn.setValue('9780132350884');
    expect(page.detectedIsbn()).toBeNull();
  });
  it('keeps lookup partial-application rules and edits made while GET is pending', async () => {
    const page = await create({ isbn });
    const request = lookup();
    const editor = page.editor();
    editor.form.patchValue({
      title: 'User title',
      description: 'Exact description',
      coverUrl: 'https://example.test/cover.png',
    });
    editor.genreInput.setValue('Pending genre');
    editor.form.controls.title.markAsTouched();
    request.flush(testBookLookup({ isbn }));
    expect(editor.form.controls.title.value).toBe('User title');
    expect(editor.form.controls.author.value).toBe('Robert C. Martin');
    expect(editor.form.controls.description.value).toBe('Exact description');
    expect(editor.form.controls.coverUrl.value).toBe('https://example.test/cover.png');
    expect(editor.form.controls.genres.value).toEqual([]);
    expect(editor.genreInput.value).toBe('Pending genre');
    expect(editor.form.controls.title.touched).toBe(true);
    http.expectNone((request) => request.method === 'POST');
  });
  it('manual ISBN edit cancels pending lookup, without new automatic lookup', async () => {
    const page = await create({ isbn });
    const request = lookup();
    page.editor().form.controls.isbn.setValue('9780132350884');
    expect(request.cancelled).toBe(true);
    expect(page.lookupState()).toBe('idle');
    http.expectNone((request) => request.method === 'GET');
  });
  it('reload of clean URL does not lookup, but explicitly reopening seeded URL does', async () => {
    await create({ isbn });
    lookup().flush(testBookLookup({ isbn }));
    fixture.destroy();
    await create();
    http.expectNone((request) => request.method === 'GET');
    fixture.destroy();
    await create({ isbn });
    lookup().flush(testBookLookup({ isbn }));
  });
  it('destroy cancels lookup and makes subsequent render cycles inert', async () => {
    await create({ isbn });
    const request = lookup();
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    http.expectNone((request) => request.method === 'POST');
  });
});

@Component({ template: '<p>Catálogo de prueba</p>' })
class CatalogRouteStub {}

describe('ISBN entry with real Router', () => {
  it('consumes URL once without destroying form/GET, then accepts a fresh explicit entry', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'books/new', component: BookCreate },
          { path: 'books', component: CatalogRouteStub },
        ]),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const harness = await RouterTestingHarness.create();
    const isbn = '9780306406157';
    const page = await harness.navigateByUrl(`/books/new?isbn=${isbn}`, BookCreate);
    await harness.fixture.whenStable();
    expect(router.url).toBe('/books/new');
    const request = http.expectOne(`/api/books/isbn-lookup?isbn=${isbn}`);
    expect(request.cancelled).toBe(false);
    expect(page.editor().form.controls.isbn.value).toBe(isbn);
    request.flush(testBookLookup({ isbn }));
    http.expectNone((request) => request.method === 'GET' || request.method === 'POST');
    await harness.navigateByUrl('/books');
    const clean = await harness.navigateByUrl('/books/new', BookCreate);
    await harness.fixture.whenStable();
    expect(clean.editor().form.controls.isbn.value).toBe('');
    http.expectNone((request) => request.method === 'GET');
    await harness.navigateByUrl('/books');
    await harness.navigateByUrl(`/books/new?isbn=${isbn}`, BookCreate);
    await harness.fixture.whenStable();
    http.expectOne(`/api/books/isbn-lookup?isbn=${isbn}`).flush(testBookLookup({ isbn }));
    expect(router.url).toBe('/books/new');
    http.verify();
  });
});
