import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { testBook, testBookRequest } from '../../models/book.testing';
import { BookCreate } from './book-create';

describe('BookCreate', () => {
  let fixture: ComponentFixture<BookCreate>;
  let component: BookCreate;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookCreate],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BookCreate);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function validForm(): void {
    component.form.patchValue({ title: 'Libro de prueba', author: 'Autora de prueba' });
  }

  function submitButton(): HTMLButtonElement {
    return element.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('should start with an empty typed form, no POST and no extra flows', () => {
    expect(component.form.invalid).toBe(true);
    expect(component.form.controls.genres.value).toEqual([]);
    expect(component.form.controls.publicationYear.value).toBeNull();
    expect(component.submitting()).toBe(false);
    expect(element.querySelector('h1')?.textContent).toBe('Añadir libro');
    expect(element.querySelector('img, input[type="file"]')).toBeNull();
    expect(submitButton().disabled).toBe(false);
    http.expectNone('/api/books');
  });

  it.each(['title', 'author'] as const)(
    'should require %s including nonblank content and enforce 255 characters',
    (field) => {
      const control = component.form.controls[field];
      for (const value of ['', ' ', '\n\t']) {
        control.setValue(value);
        expect(control.hasError('required')).toBe(true);
      }
      control.setValue('x'.repeat(256));
      expect(control.hasError('maxlength')).toBe(true);
      control.setValue('x'.repeat(255));
      expect(control.valid).toBe(true);
    },
  );

  it.each([
    ['isbn', 20],
    ['description', 5000],
    ['publisher', 255],
    ['coverUrl', 2048],
  ] as const)('should enforce the backend maximum for %s', (field, limit) => {
    const control = component.form.controls[field];
    control.setValue('x'.repeat(limit + 1));
    expect(control.hasError('maxlength')).toBe(true);
    control.setValue('');
    expect(control.valid).toBe(true);
  });

  it.each([
    ['publicationYear', [0, 2101, 1.5], [null, 1, 2100]],
    ['pageCount', [0, -1, 1.5, 2147483648], [null, 1, 2147483647]],
  ] as const)('should validate optional integer ranges for %s', (field, invalid, valid) => {
    const control = component.form.controls[field];
    for (const value of invalid) {
      control.setValue(value);
      expect(control.invalid).toBe(true);
    }
    for (const value of valid) {
      control.setValue(value);
      expect(control.valid).toBe(true);
    }
  });

  it('should accept ISBN without checksum but reject malformed ISBN', () => {
    component.form.controls.isbn.setValue('1234567890');
    expect(component.form.controls.isbn.valid).toBe(true);
    component.form.controls.isbn.setValue('bad ISBN');
    expect(component.form.controls.isbn.hasError('pattern')).toBe(true);
  });

  it('should reject cover spaces and unknown or regional languages', () => {
    component.form.controls.coverUrl.setValue(' https://example.test/a');
    expect(component.form.controls.coverUrl.hasError('coverUrl')).toBe(true);
    for (const value of ['zz', 'es-ES']) {
      component.form.controls.language.setValue(value);
      expect(component.form.controls.language.invalid).toBe(true);
    }
    component.form.controls.language.setValue('ES');
    expect(component.form.controls.language.valid).toBe(true);
  });

  it('should mark invalid fields touched, focus title and never POST', () => {
    component.submit();
    fixture.detectChanges();
    expect(component.form.controls.title.touched).toBe(true);
    expect(document.activeElement).toBe(element.querySelector('[formControlName="title"]'));
    http.expectNone('/api/books');
  });

  it('should POST a complete normalized payload and navigate to /books on success', () => {
    validForm();
    component.form.patchValue({
      isbn: '978-0132350884',
      description: ' Description\n ',
      publisher: ' Publisher ',
      publicationYear: 2008,
      pageCount: 464,
      language: 'ES',
      coverUrl: 'HTTPS://example.test/a%20b',
    });
    component.genreInput.setValue(' Fantasía ');
    component.submit();
    const request = http.expectOne('/api/books');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(
      testBookRequest({
        isbn: '978-0132350884',
        description: ' Description\n ',
        publisher: 'Publisher',
        publicationYear: 2008,
        pageCount: 464,
        language: 'es',
        coverUrl: 'HTTPS://example.test/a%20b',
        genres: ['Fantasía'],
      }),
    );
    request.flush(testBook());
    expect(navigate).toHaveBeenCalledWith(['/books']);
    expect(component.submitting()).toBe(false);
  });

  it('should send optional blanks as null and empty genres as []', () => {
    validForm();
    component.form.patchValue({ isbn: ' ', description: ' \n ', publisher: ' ', language: ' ' });
    component.submit();
    const request = http.expectOne('/api/books');
    expect(request.request.body).toEqual(testBookRequest());
    request.flush(testBook());
  });

  it('should preserve entered ISBN spaces for backend normalization', () => {
    validForm();
    component.form.controls.isbn.setValue('978 0 13 235088 4');
    component.submit();
    const request = http.expectOne('/api/books');
    expect(request.request.body.isbn).toBe('978 0 13 235088 4');
    request.flush(testBook());
  });

  it('should disable actions, show busy state and prevent duplicate POST', () => {
    validForm();
    component.submit();
    fixture.detectChanges();
    expect(submitButton().disabled).toBe(true);
    expect(element.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    expect(element.textContent).toContain('Guardando libro…');
    expect(Array.from(element.querySelectorAll('button')).every((button) => button.disabled)).toBe(
      true,
    );
    component.submit();
    component.cancel();
    expect(component.addGenre()).toBe(false);
    const request = http.expectOne('/api/books');
    expect(navigate).not.toHaveBeenCalled();
    request.flush(testBook());
  });

  it('should add trimmed genres with Enter, without splitting commas or submitting', () => {
    component.genreInput.setValue(' Fantasía, aventura ');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    element.querySelector('#genre-input')?.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(component.form.controls.genres.value).toEqual(['Fantasía, aventura']);
    expect(
      element.querySelector('button[aria-label="Eliminar género Fantasía, aventura"]'),
    ).not.toBeNull();
    http.expectNone('/api/books');
  });

  it('should reject blank, long and duplicate genres without discarding the pending text', () => {
    validForm();
    for (const value of [' ', 'x'.repeat(51)]) {
      component.genreInput.setValue(value);
      component.submit();
      expect(component.genreInput.invalid).toBe(true);
      expect(component.genreInput.value).toBe(value);
      http.expectNone('/api/books');
    }
    component.genreInput.setValue('Fantasía');
    expect(component.addGenre()).toBe(true);
    component.genreInput.setValue(' fantasía ');
    component.submit();
    expect(component.genreInput.hasError('duplicate')).toBe(true);
    expect(component.genreInput.value).toBe(' fantasía ');
    http.expectNone('/api/books');
  });

  it('should allow ten genres and reject an eleventh', () => {
    for (let i = 0; i < 10; i++) {
      component.genreInput.setValue(`Género ${i}`);
      expect(component.addGenre()).toBe(true);
    }
    component.genreInput.setValue('Otro');
    expect(component.addGenre()).toBe(false);
    expect(component.genreInput.hasError('genreLimit')).toBe(true);
    component.removeGenre(0);
    expect(component.addGenre()).toBe(true);
  });

  it('should remove chips and block removal during POST', () => {
    validForm();
    component.genreInput.setValue('Fantasía');
    component.addGenre();
    component.submit();
    component.removeGenre(0);
    expect(component.form.controls.genres.length).toBe(1);
    http.expectOne('/api/books').flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    (
      element.querySelector('button[aria-label="Eliminar género Fantasía"]') as HTMLButtonElement
    ).click();
    expect(component.form.controls.genres.length).toBe(0);
  });

  it.each([
    [400, 'Revisa los campos indicados'],
    [409, 'Ya existe un libro con ese ISBN'],
    [500, 'El servidor no pudo guardar el libro'],
    [503, 'El servidor no pudo guardar el libro'],
    [404, 'No se pudo guardar el libro'],
  ])('should retain the form and show safe error for HTTP %s', (status, message) => {
    validForm();
    component.submit();
    http
      .expectOne('/api/books')
      .flush({ title: 'SECRET', detail: 'SECRET' }, { status, statusText: 'Error' });
    fixture.detectChanges();
    expect(component.form.controls.title.value).toBe('Libro de prueba');
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(element.textContent).not.toContain('SECRET');
    expect(component.submitting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    if (status === 409) expect(component.form.controls.isbn.hasError('server')).toBe(true);
  });

  it('should show connection errors and permit a manual resubmit without automatic retry', () => {
    validForm();
    component.submit();
    http.expectOne('/api/books').error(new ProgressEvent('error'));
    expect(component.generalError()).toBe('No se puede conectar con el servidor');
    http.expectNone('/api/books');
    component.submit();
    http.expectOne('/api/books').flush(testBook());
  });

  it('should map known ProblemDetail fields safely, preserve local errors and clear server on edits', () => {
    validForm();
    component.submit();
    // A local error can appear while the request is pending; do not overwrite it.
    component.form.controls.title.setValue('');
    http
      .expectOne('/api/books')
      .flush(
        { errors: { title: 'SECRET', isbn: 'SECRET', unknown: 'SECRET' } },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(component.form.controls.title.errors).toEqual({ required: true, server: true });
    expect(component.form.controls.isbn.hasError('server')).toBe(true);
    fixture.detectChanges();
    expect(element.textContent).not.toContain('SECRET');
    component.form.controls.title.setValue('Corrected');
    component.form.controls.isbn.setValue('1234567890');
    expect(component.form.controls.title.errors).toBeNull();
    expect(component.form.controls.isbn.errors).toBeNull();
  });

  it('should map genres and genres[index], ignore bad indices and clear errors when changed', () => {
    validForm();
    component.genreInput.setValue('Fantasía');
    component.addGenre();
    component.submit();
    http.expectOne('/api/books').flush(
      {
        errors: {
          genres: 'SECRET',
          'genres[0]': 'SECRET',
          'genres[99]': 'SECRET',
          __proto__: 'SECRET',
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(component.form.controls.genres.hasError('server')).toBe(true);
    const genre = component.form.controls.genres.at(0);
    expect(genre.hasError('server')).toBe(true);
    genre.setValue('Aventura');
    expect(genre.errors).toBeNull();
    expect(component.form.controls.genres.errors).toBeNull();
  });

  it.each([null, 'bad body', { errors: ['SECRET'] }, { errors: { title: 123 } }])(
    'should tolerate malformed ProblemDetail: %j',
    (body) => {
      validForm();
      component.submit();
      http.expectOne('/api/books').flush(body, { status: 400, statusText: 'Bad Request' });
      expect(component.generalError()).toBe('Revisa los campos indicados');
      expect(component.form.controls.title.hasError('server')).toBe(false);
    },
  );

  it('should cancel directly without posting or requiring confirmation', () => {
    component.form.controls.title.setValue('Unsaved');
    component.cancel();
    expect(navigate).toHaveBeenCalledWith(['/books']);
    http.expectNone('/api/books');
  });
});
