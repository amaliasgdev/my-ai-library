import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { COVERS_CONFIG } from '../../../../core/config/covers.config';
import { testBook, testBookRequest } from '../../models/book.testing';
import { BookEdit } from './book-edit';

describe('BookEdit managed covers', () => {
  const base = 'https://images.example.test:8443/library/covers';
  const managed = `${base}/42-12345678-1234-abcd-1234-123456789abc.png`;
  const replacement = `${base}/42-87654321-1234-abcd-1234-123456789abc.jpg`;
  let fixture: ComponentFixture<BookEdit>;
  let page: BookEdit;
  let http: HttpTestingController;
  let element: HTMLElement;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: '42' }));
    TestBed.configureTestingModule({
      imports: [BookEdit],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        { provide: COVERS_CONFIG, useValue: { publicBaseUrl: base } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BookEdit);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => http.verify());
  function load(coverUrl: string | null = managed) {
    http.expectOne('/api/books/42').flush(testBook({ id: 42, coverUrl }));
    fixture.detectChanges();
  }
  function input() {
    return element.querySelector<HTMLInputElement>('#cover-file')!;
  }
  function file(type = 'image/png', name = 'image.png', size = 1) {
    return new File([new Uint8Array(size)], name, { type });
  }
  function select(selected: File) {
    Object.defineProperty(input(), 'files', { value: [selected], configurable: true });
    input().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }
  function button(text: string) {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === text,
    );
  }
  function editor() {
    return page.editor()!;
  }
  function confirmed() {
    const state = page.state();
    if (state.status !== 'loaded') throw new Error('Not loaded');
    return state.book;
  }
  function upload() {
    page.uploadCover();
    fixture.detectChanges();
    return http.expectOne('/api/books/42/cover');
  }
  function deleteAndReload() {
    page.deleteCover();
    const request = http.expectOne('/api/books/42/cover');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    return http.expectOne('/api/books/42');
  }

  it('should show the confirmed cover, accessible controls and managed-only delete', () => {
    load();
    const image = element.querySelector<HTMLImageElement>('.current-cover img')!;
    expect(image.getAttribute('src')).toBe(managed);
    expect(image.alt).toBe('Portada de Libro de prueba');
    expect(button('Eliminar portada')).toBeDefined();
    expect(input().accept).toBe('image/jpeg,image/png');
    expect(element.querySelector('label[for="cover-file"]')?.textContent).toContain('JPEG o PNG');
    expect(element.textContent).toContain('Subir o eliminar una portada se guarda inmediatamente');
  });
  it('should show fallback without cover and on image failure without extra API requests', () => {
    load();
    element.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('.current-cover')?.textContent).toContain('Sin portada');
    http.expectNone((req) => req.method === 'GET');
  });
  it('should show a null-cover fallback and not offer delete', () => {
    load(null);
    expect(element.querySelector('.current-cover')?.textContent).toContain('Sin portada');
    expect(button('Eliminar portada')).toBeUndefined();
    page.deleteCover();
    http.expectNone('/api/books/42/cover');
  });

  it('should reset image failure when a new confirmed cover arrives', () => {
    load();
    element.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    select(file());
    upload().flush(testBook({ id: 42, coverUrl: replacement }));
    fixture.detectChanges();
    expect(element.querySelector('img')?.getAttribute('src')).toBe(replacement);
  });
  it('should display external images but guard deletion, including a managed-looking foreign origin', () => {
    load('https://other.test/library/covers/42-12345678-1234-abcd-1234-123456789abc.png');
    expect(element.querySelector('img')).not.toBeNull();
    expect(button('Eliminar portada')).toBeUndefined();
    page.deleteCover();
    http.expectNone('/api/books/42/cover');
  });

  it.each(['image/jpeg', 'image/png'])(
    'should upload %s even with an unrelated extension and retain the confirmed image while pending',
    (type) => {
      load('https://external.test/cover.jpg');
      const selected = file(type, 'photo.gif');
      select(selected);
      expect(page.selectedFile()).toBe(selected);
      expect(element.textContent).toContain('photo.gif');
      expect(confirmed().coverUrl).toBe('https://external.test/cover.jpg');
      const request = upload();
      expect(request.request.body.get('file')).toBe(selected);
      expect(element.textContent).toContain('Subiendo portada…');
      expect(input().disabled).toBe(true);
      expect(confirmed().coverUrl).toBe('https://external.test/cover.jpg');
      request.flush(testBook({ id: 42, coverUrl: replacement }));
      fixture.detectChanges();
      expect(confirmed().coverUrl).toBe(replacement);
      expect(editor().form.controls.coverUrl.value).toBe(replacement);
      expect(element.querySelector('img')?.getAttribute('src')).toBe(replacement);
      expect(button('Eliminar portada')).toBeDefined();
      expect(page.selectedFile()).toBeNull();
      expect(input().value).toBe('');
      http.expectNone((req) => req.method === 'GET');
    },
  );
  it.each([
    ['image/webp', 1, 'El formato de imagen no es compatible'],
    ['image/png', 0, 'El archivo de portada no es válido'],
    ['image/png', 5_242_881, 'El archivo de portada es demasiado grande'],
  ])('should reject MIME/size before POST: %s/%s', (type, size, message) => {
    load();
    select(file(type, 'photo.png', size));
    page.uploadCover();
    expect(page.coverError()).toBe(message);
    http.expectNone('/api/books/42/cover');
    expect(confirmed().coverUrl).toBe(managed);
  });
  it('should accept exactly 5 MiB and reject an absent file', () => {
    load();
    page.uploadCover();
    expect(page.coverError()).toBe('Selecciona un archivo de portada');
    select(file('image/png', 'cover.png', 5_242_880));
    upload().flush(testBook({ id: 42, coverUrl: replacement }));
  });
  it('should preserve all draft fields, genre input, validation and dirty/touched while syncing only coverUrl', () => {
    load();
    const form = editor().form;
    form.patchValue({
      title: 'x'.repeat(256),
      author: 'Draft author',
      isbn: '9780132350884',
      description: ' Exact\n',
      publisher: 'Draft publisher',
      publicationYear: 2025,
      pageCount: 234,
      language: 'es',
      coverUrl: 'https://draft.test/cover.png',
    });
    form.controls.title.markAsDirty();
    form.controls.title.markAsTouched();
    editor().genreInput.setValue('Draft chip');
    editor().addGenre();
    editor().genreInput.setValue('Pending genre');
    form.controls.genres.markAsTouched();
    const before = form.getRawValue();
    const controls = Object.entries(form.controls)
      .filter(([field]) => field !== 'coverUrl')
      .map(([field, control]) => ({
        field,
        dirty: control.dirty,
        touched: control.touched,
        errors: control.errors,
      }));
    select(file());
    upload().flush(testBook({ id: 42, coverUrl: replacement }));
    fixture.detectChanges();
    expect(form.getRawValue()).toEqual({ ...before, coverUrl: replacement });
    expect(editor().genreInput.value).toBe('Pending genre');
    for (const state of controls) {
      const control = form.get(state.field)!;
      expect(control.dirty).toBe(state.dirty);
      expect(control.touched).toBe(state.touched);
      expect(control.errors).toEqual(state.errors);
    }
    expect(editor()).toBe(page.editor());
  });

  it.each([
    [0, 'No se puede conectar con el servidor'],
    [400, 'El archivo de portada no es válido'],
    [413, 'El archivo de portada es demasiado grande'],
    [404, 'El libro ya no existe'],
    [415, 'El formato de imagen no es compatible'],
    [500, 'El servidor no pudo guardar la portada'],
    [409, 'No se pudo actualizar la portada'],
  ])(
    'should preserve file/image on upload error %s and allow explicit retry',
    (status, message) => {
      load();
      const selected = file();
      select(selected);
      const request = upload();
      if (status === 0) request.error(new ProgressEvent('error'));
      else request.flush({ detail: 'PRIVATE /storage/path' }, { status, statusText: 'Error' });
      fixture.detectChanges();
      expect(page.coverError()).toBe(message);
      expect(confirmed().coverUrl).toBe(managed);
      expect(page.selectedFile()).toBe(selected);
      expect(element.textContent).not.toContain('PRIVATE');
      expect(element.querySelector('.cover-section [role="alert"]')?.textContent).toContain(
        message,
      );
      expect(page.writesBlocked()).toBe(false);
      upload().flush(testBook({ id: 42, coverUrl: replacement }));
    },
  );
  it.each([
    [0, 'No se puede conectar con el servidor'],
    [404, 'El libro ya no existe'],
    [500, 'El servidor no pudo eliminar la portada'],
    [400, 'No se pudo actualizar la portada'],
  ])('should preserve confirmed reference on delete error %s', (status, message) => {
    load();
    page.deleteCover();
    const request = http.expectOne('/api/books/42/cover');
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ detail: 'PRIVATE' }, { status, statusText: 'Error' });
    expect(page.coverError()).toBe(message);
    expect(confirmed().coverUrl).toBe(managed);
    expect(page.coverUnsynced()).toBe(false);
    http.expectNone('/api/books/42');
  });

  it('should keep the previous reference through DELETE/GET and sync only coverUrl after the GET', () => {
    load();
    editor().form.patchValue({
      title: 'Draft',
      description: 'Exact',
      coverUrl: 'https://draft.test/cover',
    });
    editor().genreInput.setValue('Pending');
    const before = editor().form.getRawValue();
    const reload = deleteAndReload();
    expect(confirmed().coverUrl).toBe(managed);
    expect(editor().form.controls.coverUrl.value).toBe('https://draft.test/cover');
    expect(page.coverOperation()).toBe('reloading');
    reload.flush(testBook({ id: 42, coverUrl: null }));
    fixture.detectChanges();
    expect(editor().form.getRawValue()).toEqual({ ...before, coverUrl: '' });
    expect(editor().genreInput.value).toBe('Pending');
    expect(confirmed().coverUrl).toBeNull();
    expect(page.writesBlocked()).toBe(false);
    expect(button('Eliminar portada')).toBeUndefined();
  });
  it('should block all writes after a committed DELETE and failed GET, retrying only GET', () => {
    load();
    const reload = deleteAndReload();
    reload.flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(page.coverError()).toBe(
      'La portada se eliminó, pero no se pudo actualizar la información del libro.',
    );
    expect(page.coverUnsynced()).toBe(true);
    expect(page.writesBlocked()).toBe(true);
    expect(button('Guardar')?.disabled).toBe(true);
    page.save(testBookRequest());
    page.uploadCover();
    page.deleteCover();
    http.expectNone('/api/books/42/cover');
    http.expectNone('/api/books/42');
    button('Reintentar actualización')!.click();
    const retry = http.expectOne('/api/books/42');
    expect(retry.request.method).toBe('GET');
    page.retryCoverReload();
    http.expectNone('/api/books/42');
    retry.flush(testBook({ id: 42, coverUrl: null }));
    fixture.detectChanges();
    expect(page.coverUnsynced()).toBe(false);
    expect(page.writesBlocked()).toBe(false);
    expect(page.coverError()).toBeNull();
    expect(button('Reintentar actualización')).toBeUndefined();
  });

  it('should allow leaving an unsynchronized screen after the failed reload without permitting writes', () => {
    load();
    deleteAndReload().flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(button('Cancelar')?.disabled).toBe(false);
    page.cancel();
    expect(navigate).toHaveBeenCalledWith(['/books']);
    expect(page.writesBlocked()).toBe(true);
  });

  it('should guard all writes and Cancelar while DELETE and synchronization GET are pending', () => {
    load();
    page.deleteCover();
    const deletion = http.expectOne('/api/books/42/cover');
    fixture.detectChanges();
    page.uploadCover();
    page.deleteCover();
    page.save(testBookRequest());
    page.cancel();
    http.expectNone('/api/books/42/cover');
    http.expectNone('/api/books/42');
    expect(navigate).not.toHaveBeenCalled();
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    const reload = http.expectOne('/api/books/42');
    fixture.detectChanges();
    page.save(testBookRequest());
    page.deleteCover();
    page.uploadCover();
    page.cancel();
    expect(button('Guardar')?.disabled).toBe(true);
    expect(button('Cancelar')?.disabled).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone('/api/books/42/cover');
    http.expectNone('/api/books/42');
    reload.flush(testBook({ id: 42, coverUrl: null }));
  });

  it('should guard PUT/delete/upload/select/cancel during upload and block all controls visibly', () => {
    load();
    const selected = file();
    select(selected);
    const request = upload();
    page.uploadCover();
    page.deleteCover();
    page.save(testBookRequest());
    page.cancel();
    Object.defineProperty(input(), 'files', { value: [file('image/jpeg')], configurable: true });
    input().dispatchEvent(new Event('change'));
    expect(page.selectedFile()).toBe(selected);
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone('/api/books/42/cover');
    http.expectNone('/api/books/42');
    expect(button('Guardar')?.disabled).toBe(true);
    expect(button('Cancelar')?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[formControlName="title"]')?.readOnly).toBe(
      true,
    );
    request.flush(testBook({ id: 42, coverUrl: replacement }));
  });
  it('should block cover actions and selection while PUT is pending', () => {
    load();
    select(file());
    page.save(testBookRequest({ coverUrl: managed }));
    const put = http.expectOne('/api/books/42');
    fixture.detectChanges();
    page.uploadCover();
    page.deleteCover();
    expect(input().disabled).toBe(true);
    http.expectNone('/api/books/42/cover');
    put.flush(testBook({ id: 42, coverUrl: managed }));
  });
  it('should preserve normal manual URL replacement semantics after upload', () => {
    load();
    select(file());
    upload().flush(testBook({ id: 42, coverUrl: replacement }));
    fixture.detectChanges();
    editor().form.controls.coverUrl.setValue('https://external.test/new.png');
    editor().submit();
    const put = http.expectOne('/api/books/42');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.coverUrl).toBe('https://external.test/new.png');
    put.flush(testBook());
    http.expectNone('/api/books/42/cover');
  });
  it.each(['upload', 'delete', 'reload'])(
    'should cancel %s subscriptions on destroy',
    (operation) => {
      load();
      let request;
      if (operation === 'upload') {
        select(file());
        request = upload();
      } else if (operation === 'delete') {
        page.deleteCover();
        request = http.expectOne('/api/books/42/cover');
      } else request = deleteAndReload();
      fixture.destroy();
      expect(request.cancelled).toBe(true);
    },
  );
  it.each(['upload', 'reload'])(
    'should discard %s responses when the route id changes',
    (operation) => {
      load();
      let old;
      if (operation === 'upload') {
        select(file());
        old = upload();
      } else old = deleteAndReload();
      params.next(convertToParamMap({ id: '43' }));
      expect(old.cancelled).toBe(true);
      http
        .expectOne('/api/books/43')
        .flush(testBook({ id: 43, coverUrl: 'https://external.test/new.jpg' }));
      fixture.detectChanges();
      expect(confirmed().id).toBe(43);
      expect(editor().form.controls.coverUrl.value).toBe('https://external.test/new.jpg');
      expect(page.coverUnsynced()).toBe(false);
      expect(page.selectedFile()).toBeNull();
      expect(() => old.flush(testBook({ id: 42, coverUrl: replacement }))).toThrow();
    },
  );
});
