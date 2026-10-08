import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { BookResponse } from '../../models/book.models';
import { testBook, testBookRequest } from '../../models/book.testing';
import { BookEdit } from './book-edit';

describe('BookEdit', () => {
  let fixture: ComponentFixture<BookEdit>;
  let component: BookEdit;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const managedCover =
    'HTTPS://Images.Example.test:8443/api/covers/42-12345678-1234-1234-1234-123456789abc.png';

  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: '42' }));
    TestBed.configureTestingModule({
      imports: [BookEdit],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  function create(): void {
    fixture = TestBed.createComponent(BookEdit);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  function load(book: BookResponse = testBook({ id: 42 })): void {
    create();
    http.expectOne('/api/books/42').flush(book);
    fixture.detectChanges();
  }

  it('should GET a positive id and show loading without rendering an empty form', () => {
    create();
    const request = http.expectOne('/api/books/42');
    expect(request.request.method).toBe('GET');
    expect(element.querySelector('h1')?.textContent).toBe('Editar libro');
    expect(element.querySelector('mat-spinner')).not.toBeNull();
    expect(element.textContent).toContain('Cargando libro…');
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull();
    (element.querySelector('button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/books']);
    request.flush(testBook({ id: 42 }));
  });

  it.each(['0', '-1', '1.5', 'abc', '+1', 'NaN', 'Infinity', '9007199254740992', '', ' 42 '])(
    'should reject invalid route id %j without any GET',
    (id) => {
      params.next(convertToParamMap({ id }));
      create();
      http.expectNone((req) => req.method === 'GET');
      expect(element.querySelector('[role="alert"]')?.textContent).toBe(
        'El identificador del libro no es válido',
      );
      expect(element.querySelector('form')).toBeNull();
      component.cancel();
      expect(navigate).toHaveBeenCalledWith(['/books']);
    },
  );

  it('should preload every editable field, numeric values and genres without modifying the URL', () => {
    load(
      testBook({
        id: 42,
        coverUrl: managedCover,
        isbn: '9780132350884',
        description: ' Description ',
        publisher: 'Publisher',
        publicationYear: 2001,
        pageCount: 120,
        language: 'es',
        genres: ['Aventura', 'Fantasía'],
      }),
    );
    const editor = component.editor()!;
    expect(editor.form.getRawValue()).toEqual({
      ...testBookRequest(),
      isbn: '9780132350884',
      description: ' Description ',
      coverUrl: managedCover,
      publisher: 'Publisher',
      publicationYear: 2001,
      pageCount: 120,
      language: 'es',
      genres: ['Aventura', 'Fantasía'],
    });
    expect(editor.form.pristine).toBe(true);
    expect(editor.form.untouched).toBe(true);
    expect(element.querySelectorAll('mat-chip')).toHaveLength(2);
    expect(element.querySelector('mat-spinner')).toBeNull();
  });

  it('should map textual nulls to empty inputs and numeric nulls to null', () => {
    load();
    const value = component.editor()!.form.getRawValue();
    expect(value.isbn).toBe('');
    expect(value.description).toBe('');
    expect(value.coverUrl).toBe('');
    expect(value.publisher).toBe('');
    expect(value.language).toBe('');
    expect(value.publicationYear).toBeNull();
    expect(value.pageCount).toBeNull();
    expect(value.genres).toEqual([]);
  });

  it.each([
    [404, 'El libro no existe'],
    [500, 'El servidor no pudo cargar el libro'],
    [503, 'El servidor no pudo cargar el libro'],
    [400, 'No se pudo cargar el libro'],
  ])('should show a safe load error for HTTP %s', (status, message) => {
    create();
    http.expectOne('/api/books/42').flush({ detail: 'SECRET' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('SECRET');
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('button')?.textContent).toContain('Volver al catálogo');
  });

  it('should explain status 0 during loading', () => {
    create();
    http.expectOne('/api/books/42').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(element.textContent).toContain('No se puede conectar con el servidor');
  });

  it('should cancel a previous GET when id changes and display only the latest response', () => {
    create();
    const previous = http.expectOne('/api/books/42');
    params.next(convertToParamMap({ id: '43' }));
    expect(previous.cancelled).toBe(true);
    http.expectOne('/api/books/43').flush(testBook({ id: 43, title: 'Latest book' }));
    fixture.detectChanges();
    expect(component.editor()!.form.controls.title.value).toBe('Latest book');
    expect(() => previous.flush(testBook())).toThrow();
  });

  it('should reset the form when moving from one loaded book to another', () => {
    load();
    component.editor()!.form.controls.title.setValue('Unsaved edit');
    params.next(convertToParamMap({ id: '43' }));
    fixture.detectChanges();
    expect(element.querySelector('form')).toBeNull();
    http.expectOne('/api/books/43').flush(testBook({ id: 43, title: 'Other book' }));
    fixture.detectChanges();
    expect(component.editor()!.form.controls.title.value).toBe('Other book');
    expect(component.editor()!.form.pristine).toBe(true);
  });

  it('should refuse invalid forms and not PUT', () => {
    load();
    const editor = component.editor()!;
    editor.form.controls.title.setValue(' ');
    editor.submit();
    expect(editor.form.controls.title.touched).toBe(true);
    http.expectNone((req) => req.method === 'PUT');
  });

  it('should PUT exactly ten request fields, preserve the managed cover and navigate on success', () => {
    load(
      testBook({
        id: 42,
        coverUrl: managedCover,
        readingStatus: 'READ',
        rating: 5,
        startedOn: '2026-01-01',
      }),
    );
    component.editor()!.submit();
    const request = http.expectOne('/api/books/42');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(testBookRequest({ coverUrl: managedCover }));
    expect(Object.keys(request.request.body)).toHaveLength(10);
    request.flush(testBook({ id: 42, coverUrl: managedCover }));
    expect(navigate).toHaveBeenCalledWith(['/books']);
    expect(component.submitting()).toBe(false);
  });

  it.each(['', 'HTTPS://External.Example.test:8443/a%20b?x=1#cover'])(
    'should send a cleared or replaced cover without rewriting it: %j',
    (coverUrl) => {
      load(testBook({ id: 42, coverUrl: managedCover, genres: ['Aventura'] }));
      const editor = component.editor()!;
      editor.form.controls.coverUrl.setValue(coverUrl);
      editor.removeGenre(0);
      editor.submit();
      const request = http.expectOne('/api/books/42');
      expect(request.request.body.coverUrl).toBe(coverUrl === '' ? null : coverUrl);
      expect(request.request.body.genres).toEqual([]);
      request.flush(testBook({ id: 42 }));
    },
  );

  it('should process a pending genre and use the shared request normalization', () => {
    load();
    const editor = component.editor()!;
    editor.form.patchValue({
      publisher: ' Publisher ',
      language: 'ES',
      description: ' Description\n ',
      isbn: '978-0132350884',
      publicationYear: 2001,
      pageCount: 120,
    });
    editor.genreInput.setValue(' Aventura ');
    editor.submit();
    const request = http.expectOne('/api/books/42');
    expect(request.request.body).toEqual(
      testBookRequest({
        publisher: 'Publisher',
        language: 'es',
        description: ' Description\n ',
        isbn: '978-0132350884',
        publicationYear: 2001,
        pageCount: 120,
        genres: ['Aventura'],
      }),
    );
    request.flush(testBook({ id: 42 }));
  });

  it('should prevent double PUT and block form actions during saving', () => {
    load(testBook({ id: 42, genres: ['Aventura'] }));
    const editor = component.editor()!;
    editor.submit();
    component.save(testBookRequest());
    fixture.detectChanges();
    editor.submit();
    editor.cancel();
    editor.removeGenre(0);
    expect(editor.form.controls.genres.length).toBe(1);
    expect(component.submitting()).toBe(true);
    expect(element.textContent).toContain('Guardando libro…');
    expect(Array.from(element.querySelectorAll('button')).every((button) => button.disabled)).toBe(
      true,
    );
    const request = http.expectOne('/api/books/42');
    request.flush(testBook({ id: 42 }));
  });

  it.each([
    [400, 'Revisa los campos indicados'],
    [404, 'El libro ya no existe'],
    [409, 'Ya existe un libro con ese ISBN'],
    [500, 'El servidor no pudo guardar los cambios'],
    [503, 'El servidor no pudo guardar los cambios'],
    [403, 'No se pudieron guardar los cambios'],
  ])('should retain the form and show a safe save error for HTTP %s', (status, message) => {
    load();
    const editor = component.editor()!;
    editor.form.controls.title.setValue('Edited title');
    editor.submit();
    http
      .expectOne('/api/books/42')
      .flush({ title: 'SECRET', detail: 'SECRET' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(component.editor()).toBe(editor);
    expect(editor.form.controls.title.value).toBe('Edited title');
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('SECRET');
    expect(navigate).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
    if (status === 409) expect(editor.form.controls.isbn.hasError('server')).toBe(true);
  });

  it('should show connection failure during PUT without automatic retries', () => {
    load();
    component.editor()!.submit();
    http.expectOne('/api/books/42').error(new ProgressEvent('error'));
    expect(component.generalError()).toBe('No se puede conectar con el servidor');
    http.expectNone((req) => req.method === 'PUT');
  });

  it('should map backend cover rejection and other known fields without internal messages', () => {
    load(testBook({ id: 42, coverUrl: managedCover, genres: ['Aventura'] }));
    const editor = component.editor()!;
    editor.submit();
    http
      .expectOne('/api/books/42')
      .flush(
        { errors: { coverUrl: 'SECRET', 'genres[0]': 'SECRET', unknown: 'SECRET' } },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(editor.form.controls.coverUrl.hasError('server')).toBe(true);
    expect(editor.form.controls.genres.at(0).hasError('server')).toBe(true);
    editor.form.controls.coverUrl.setValue('https://example.test/new.png');
    expect(editor.form.controls.coverUrl.errors).toBeNull();
    fixture.detectChanges();
    expect(element.textContent).not.toContain('SECRET');
  });

  it('should cancel directly and not PUT', () => {
    load();
    component.editor()!.cancel();
    expect(navigate).toHaveBeenCalledWith(['/books']);
    http.expectNone((req) => req.method === 'PUT');
  });
});
