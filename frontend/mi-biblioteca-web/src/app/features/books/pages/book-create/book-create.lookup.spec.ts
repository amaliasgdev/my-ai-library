import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BookForm } from '../../components/book-form/book-form';
import { testBook, testBookLookup } from '../../models/book.testing';
import { BookCreate } from './book-create';

describe('BookCreate ISBN lookup', () => {
  let fixture: ComponentFixture<BookCreate>;
  let page: BookCreate;
  let editor: BookForm;
  let http: HttpTestingController;
  let element: HTMLElement;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookCreate],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BookCreate);
    page = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    editor = page.editor();
    element = fixture.nativeElement;
  });
  afterEach(() => http.verify());
  function lookupButton() {
    return element.querySelector<HTMLButtonElement>('.isbn-lookup button')!;
  }
  function begin(isbn = '978-0132350884') {
    editor.form.controls.isbn.setValue(isbn);
    fixture.detectChanges();
    lookupButton().click();
    fixture.detectChanges();
    return http.expectOne((req) => req.url === '/api/books/isbn-lookup');
  }

  it('should expose an optional lookup button in create and preserve labels and focus', () => {
    expect(lookupButton().textContent).toContain('Buscar por ISBN');
    expect(lookupButton().type).toBe('button');
    expect(element.textContent).toContain(
      'Completa los campos vacíos. Revisa los datos antes de guardar.',
    );
    expect(editor.lookupEnabled()).toBe(true);
    expect(page.lookupState()).toBe('idle');
  });

  it.each(['', ' ', 'bad ISBN', '1'.repeat(21)])(
    'should not GET for empty or locally invalid ISBN %s',
    (isbn) => {
      editor.form.controls.isbn.setValue(isbn);
      editor.requestLookup();
      page.lookup(isbn);
      http.expectNone((req) => req.method === 'GET');
    },
  );

  it('should not require title, author or a local checksum and should block only lookup while loading', () => {
    const request = begin('1234567890');
    expect(request.request.params.get('isbn')).toBe('1234567890');
    expect(page.lookupState()).toBe('loading');
    expect(lookupButton().disabled).toBe(true);
    expect(element.textContent).toContain('Consultando ISBN…');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(element.querySelector<HTMLInputElement>('[formControlName="title"]')?.readOnly).toBe(
      false,
    );
    editor.requestLookup();
    page.lookup('1234567890');
    http.expectNone((req) => req.method === 'GET');
    request.flush(testBookLookup());
  });

  it('should fill empty fields, normalize ISBN, preserve description and mark changed controls dirty without touching them', () => {
    editor.form.controls.description.setValue('  My exact description\n');
    const request = begin();
    editor.form.controls.publisher.markAsTouched();
    request.flush(testBookLookup());
    fixture.detectChanges();
    expect(editor.form.getRawValue()).toEqual({
      ...testBookLookup(),
      description: '  My exact description\n',
    });
    expect(page.lookupState()).toBe('success');
    expect(element.textContent).toContain(
      'Consulta completada. Revisa y completa los datos antes de guardar.',
    );
    for (const field of [
      'title',
      'author',
      'isbn',
      'publisher',
      'language',
      'coverUrl',
      'publicationYear',
      'pageCount',
      'genres',
    ] as const)
      expect(editor.form.controls[field].dirty).toBe(true);
    expect(editor.form.controls.title.untouched).toBe(true);
    expect(editor.form.controls.publisher.touched).toBe(true);
    expect(editor.form.controls.description.pristine).toBe(true);
  });

  it('should fill whitespace-only text fields', () => {
    editor.form.patchValue({
      title: ' ',
      author: '\t',
      publisher: ' ',
      language: ' ',
      coverUrl: ' ',
    });
    begin().flush(testBookLookup());
    expect(editor.form.controls.title.value).toBe('Clean Code');
    expect(editor.form.controls.coverUrl.value).toBe('https://covers.example.test/book.jpg');
  });

  it('should preserve all occupied fields and genres without merging', () => {
    editor.form.patchValue({
      title: 'Manual title',
      author: 'Manual author',
      publisher: 'Manual publisher',
      language: 'es',
      publicationYear: 2020,
      pageCount: 100,
      coverUrl: 'https://manual.test/cover.jpg',
    });
    editor.genreInput.setValue('Manual');
    editor.addGenre();
    const before = editor.form.getRawValue();
    begin().flush(testBookLookup());
    expect(editor.form.getRawValue()).toEqual({ ...before, isbn: '9780132350884' });
    expect(editor.form.controls.title.pristine).toBe(true);
    expect(editor.form.controls.genres.value).toEqual(['Manual']);
  });

  it('should preserve a pending genre, including whitespace, instead of applying provider chips', () => {
    editor.genreInput.setValue(' Pending genre ');
    begin().flush(testBookLookup());
    expect(editor.form.controls.genres.value).toEqual([]);
    expect(editor.genreInput.value).toBe(' Pending genre ');
  });

  it('should not clear values for null metadata or empty genres', () => {
    editor.form.patchValue({ title: 'Manual', description: 'Exact', publicationYear: 2020 });
    begin().flush(
      testBookLookup({
        title: null,
        author: null,
        publisher: null,
        language: null,
        publicationYear: null,
        pageCount: null,
        coverUrl: null,
        genres: [],
      }),
    );
    expect(editor.form.controls.title.value).toBe('Manual');
    expect(editor.form.controls.author.value).toBe('');
    expect(editor.form.controls.publicationYear.value).toBe(2020);
    expect(editor.form.controls.pageCount.value).toBeNull();
    expect(editor.form.controls.genres.pristine).toBe(true);
  });

  it('should keep edits made during the GET and retain touched/dirty state on unchanged fields', () => {
    const request = begin();
    editor.form.controls.title.setValue('Typed during wait');
    editor.form.controls.title.markAsTouched();
    request.flush(testBookLookup());
    expect(editor.form.controls.title.value).toBe('Typed during wait');
    expect(editor.form.controls.title.touched).toBe(true);
    expect(editor.form.controls.title.pristine).toBe(true);
    expect(editor.form.controls.author.value).toBe('Robert C. Martin');
  });

  it('should cancel on ISBN edits without automatically looking up, even after changing back', () => {
    const old = begin();
    editor.form.controls.isbn.setValue('9780306406157');
    expect(old.cancelled).toBe(true);
    expect(page.lookupState()).toBe('idle');
    http.expectNone((req) => req.method === 'GET');
    editor.form.controls.isbn.setValue('978-0132350884');
    expect(() => old.flush(testBookLookup())).toThrow();
    expect(editor.form.controls.title.value).toBe('');
    fixture.detectChanges();
    editor.requestLookup();
    http.expectOne((req) => req.url === '/api/books/isbn-lookup').flush(testBookLookup());
    expect(page.lookupState()).toBe('success');
  });

  it.each([
    [0, 'No se puede conectar con el servidor'],
    [400, 'El ISBN no es válido'],
    [404, 'No se encontraron datos para este ISBN'],
    [502, 'No se pudieron interpretar los datos del proveedor'],
    [503, 'El servicio de consulta de libros no está disponible'],
    [504, 'La consulta ha tardado demasiado'],
    [500, 'No se pudo consultar el ISBN'],
  ])(
    'should show safe error %s without altering form validity or data and allow retry',
    (status, message) => {
      editor.form.patchValue({ title: 'Manual', author: 'Author', description: 'Exact' });
      const request = begin();
      const before = editor.form.getRawValue();
      if (status === 0) request.error(new ProgressEvent('error'));
      else
        request.flush(
          { detail: 'PRIVATE', errors: { isbn: 'PRIVATE' } },
          { status, statusText: 'Error', headers: { 'Retry-After': '100' } },
        );
      fixture.detectChanges();
      expect(page.lookupState()).toBe('error');
      expect(element.querySelector('.isbn-lookup [role="alert"]')?.textContent).toContain(message);
      expect(element.textContent).not.toContain('PRIVATE');
      expect(editor.form.getRawValue()).toEqual(before);
      expect(editor.form.valid).toBe(true);
      expect(editor.form.controls.isbn.hasError('server')).toBe(false);
      editor.requestLookup();
      http.expectOne((req) => req.url === '/api/books/isbn-lookup').flush(testBookLookup());
    },
  );

  it('should cancel a pending lookup on valid submit and POST only current manual values', () => {
    editor.form.patchValue({ title: 'Manual', author: 'Author' });
    const lookup = begin();
    editor.submit();
    expect(lookup.cancelled).toBe(true);
    const post = http.expectOne('/api/books');
    expect(post.request.method).toBe('POST');
    expect(post.request.body.title).toBe('Manual');
    expect(post.request.body.isbn).toBe('978-0132350884');
    post.flush(testBook());
    expect(() => lookup.flush(testBookLookup())).toThrow();
  });

  it('should cancel lookup even when a submission attempt fails normal form validation', () => {
    const lookup = begin();
    editor.submit();
    expect(lookup.cancelled).toBe(true);
    http.expectNone('/api/books');
    expect(editor.form.controls.title.hasError('required')).toBe(true);
  });

  it('should create only after explicit submit and use the existing BookRequest builder after success', () => {
    editor.form.controls.description.setValue('My description');
    begin().flush(testBookLookup());
    http.expectNone('/api/books');
    editor.submit();
    const post = http.expectOne('/api/books');
    expect(post.request.body).toEqual({ ...testBookLookup(), description: 'My description' });
    post.flush(testBook());
  });

  it.each(['cancel', 'destroy'])('should cancel pending GET on %s', (action) => {
    const request = begin();
    if (action === 'cancel') editor.cancel();
    else fixture.destroy();
    expect(request.cancelled).toBe(true);
    expect(() => request.flush(testBookLookup())).toThrow();
  });

  it('should preserve normalized success without treating its programmatic ISBN update as an edit', () => {
    begin().flush(testBookLookup());
    expect(page.lookupState()).toBe('success');
    expect(editor.form.controls.isbn.value).toBe('9780132350884');
    editor.form.controls.isbn.setValue('9780306406157');
    expect(page.lookupState()).toBe('idle');
  });

  it('should ignore a mismatched response even if a programmatic ISBN change did not emit events', () => {
    const request = begin();
    editor.form.controls.isbn.setValue('9780306406157', { emitEvent: false });
    request.flush(testBookLookup());
    expect(editor.form.controls.title.value).toBe('');
    expect(editor.form.controls.isbn.value).toBe('9780306406157');
    expect(page.lookupState()).toBe('idle');
  });
});
