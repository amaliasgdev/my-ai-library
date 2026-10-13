import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../../app.routes';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';
import { BookDetail } from '../book-detail/book-detail';
import { BookEdit } from '../book-edit/book-edit';
import { BookImport } from '../book-import/book-import';

describe('physical location catalog navigation and presentation', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => {
    http.verify();
    harness.fixture.destroy();
  });
  async function stable() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  function request() {
    return http.expectOne((req) => req.url === '/api/books' || req.url === '/api/books/search');
  }
  function params() {
    return router.parseUrl(router.url).queryParams;
  }
  async function loaded(url = '/books') {
    const page = await harness.navigateByUrl(url, BooksCatalog);
    request().flush(testBookPage({ totalElements: 100 }));
    await stable();
    return page;
  }
  function link(text: string) {
    return Array.from(harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('a')).find(
      (item) => item.textContent?.trim() === text,
    )!;
  }

  it('location draft causes no GET; Apply/Clear reset page preserving search, sort, size and existing filters as appropriate', async () => {
    const page = await loaded(
      '/books?page=2&size=50&sortBy=author&direction=DESC&title=Dune&genre=Terror',
    );
    const navigate = vi.spyOn(router, 'navigate');
    page.filtersForm.patchValue({
      room: ' Salón ',
      bookcase: ' Billy izquierda ',
      shelf: ' Superior ',
    });
    await stable();
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone((req) => req.method === 'GET');
    page.applyFilters();
    await stable();
    expect(params()).toEqual({
      size: '50',
      sortBy: 'author',
      direction: 'DESC',
      title: 'Dune',
      genre: 'Terror',
      room: 'Salón',
      bookcase: 'Billy izquierda',
      shelf: 'Superior',
    });
    const applied = request();
    expect(applied.request.url).toBe('/api/books/search');
    expect(applied.request.params.get('room')).toBe('Salón');
    expect(applied.request.params.get('page')).toBe('0');
    applied.flush(testBookPage());
    page.clearFilters();
    await stable();
    expect(params()).toEqual({ size: '50', sortBy: 'author', direction: 'DESC', title: 'Dune' });
    expect(page.filtersForm.getRawValue()).toMatchObject({ room: '', bookcase: '', shelf: '' });
    const cleared = request();
    for (const key of ['room', 'bookcase', 'shelf', 'genre'])
      expect(cleared.request.params.has(key)).toBe(false);
    cleared.flush(testBookPage());
  });

  it('raw invalid location draft stays local and is not silently trimmed into validity', async () => {
    const page = await loaded();
    page.filtersForm.patchValue({
      room: ' ' + 'x'.repeat(100),
      bookcase: '\tBilly',
      shelf: 'A\nB',
    });
    page.applyFilters();
    await stable();
    expect(router.url).toBe('/books');
    expect(page.filtersForm.touched).toBe(true);
    http.expectNone((req) => req.method === 'GET');
  });

  it('malformed URL canonicalizes each location independently before exactly one GET, without visual error', async () => {
    const navigate = vi.spyOn(router, 'navigate');
    const page = await harness.navigateByUrl(
      '/books?room=A&room=B&bookcase=%20Billy%20&shelf=%0A3&ratingMin=4',
      BooksCatalog,
    );
    await stable();
    expect(params()).toEqual({ ratingMin: '4', bookcase: 'Billy' });
    expect(navigate).toHaveBeenCalledWith(['/books'], {
      queryParams: { ratingMin: '4', bookcase: 'Billy' },
      replaceUrl: true,
    });
    const req = request();
    expect(req.request.params.get('bookcase')).toBe('Billy');
    expect(req.request.params.has('room')).toBe(false);
    req.flush(testBookPage());
    await stable();
    expect(page.currentFilters()).toEqual({ ratingMin: 4, bookcase: 'Billy' });
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
  });

  it('restored URL loads physical filters; Back/Forward restores applied filters and GET cancellation remains intact', async () => {
    await loaded('/books?room=Sal%C3%B3n&bookcase=Billy&shelf=3');
    const page = await harness.navigateByUrl('/books?room=Dormitorio&shelf=Superior', BooksCatalog);
    const previous = request();
    await harness.navigateByUrl('/books?room=Sal%C3%B3n&bookcase=Billy&shelf=3', BooksCatalog);
    expect(previous.cancelled).toBe(true);
    request().flush(testBookPage());
    await stable();
    TestBed.inject(Location).back();
    await vi.waitFor(() => expect(params()).toEqual({ room: 'Dormitorio', shelf: 'Superior' }));
    await stable();
    const back = request();
    expect(back.request.params.get('room')).toBe('Dormitorio');
    back.flush(testBookPage());
    await stable();
    expect(page.filtersForm.controls.room.value).toBe('Dormitorio');
    TestBed.inject(Location).forward();
    await vi.waitFor(() =>
      expect(params()).toEqual({ room: 'Salón', bookcase: 'Billy', shelf: '3' }),
    );
    await stable();
    const forward = request();
    expect(forward.request.params.get('shelf')).toBe('3');
    forward.flush(testBookPage());
    await stable();
    expect(page.currentFilters()).toEqual({ room: 'Salón', bookcase: 'Billy', shelf: '3' });
  });

  it('DELETE blocks Apply/Clear and reload retains applied location, not drafts', async () => {
    const page = await loaded('/books?room=Sal%C3%B3n&shelf=3');
    page.openDeleteDialog(testBook());
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(page.deletingId()).toBe(1));
    page.filtersForm.controls.room.setValue('Draft');
    page.applyFilters();
    page.clearFilters();
    expect(params()).toEqual({ room: 'Salón', shelf: '3' });
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    const reload = request();
    expect(reload.request.params.get('room')).toBe('Salón');
    reload.flush(testBookPage());
  });

  it('detail/edit context carries filters, never preloads them into an unlocated book; PUT sends manual location and returns with context', async () => {
    const url =
      '/books?page=2&size=50&sortBy=author&title=Dune&room=Sal%C3%B3n&bookcase=Billy&shelf=3';
    await loaded(url);
    const context = params();
    const detailLink = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      'a[aria-label^="Ver detalle de "]',
    )!;
    detailLink.click();
    await stable();
    expect(params()).toEqual(context);
    const get = http.expectOne('/api/books/1');
    expect(get.request.params.keys()).toEqual([]);
    get.flush(testBook());
    await stable();
    expect(harness.routeNativeElement!.querySelector('#location-heading')).toBeNull();
    link('Editar').click();
    await stable();
    http.expectOne('/api/books/1').flush(testBook());
    await stable();
    const edit = harness.routeDebugElement!.componentInstance as BookEdit;
    expect(edit.editor()!.form.getRawValue()).toMatchObject({ room: '', bookcase: '', shelf: '' });
    edit.editor()!.form.patchValue({ room: ' Dormitorio ', shelf: ' Superior ' });
    edit.editor()!.submit();
    const put = http.expectOne('/api/books/1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.params.keys()).toEqual([]);
    expect(put.request.body).toMatchObject({
      room: 'Dormitorio',
      bookcase: null,
      shelf: 'Superior',
    });
    put.flush(testBook({ room: 'Dormitorio', shelf: 'Superior' }));
    await stable();
    expect(params()).toEqual(context);
    const reload = request();
    expect(reload.request.params.get('room')).toBe('Salón');
    reload.flush(testBookPage());
  });

  it('edit clearing existing location sends nulls, and Cancel preserves URL context without writes', async () => {
    const edit = await harness.navigateByUrl(
      '/books/1/edit?room=Sal%C3%B3n&bookcase=Billy&shelf=3',
      BookEdit,
    );
    http
      .expectOne('/api/books/1')
      .flush(testBook({ room: 'Dormitorio', bookcase: 'Negra', shelf: 'Abajo' }));
    await stable();
    expect(edit.editor()!.form.getRawValue()).toMatchObject({
      room: 'Dormitorio',
      bookcase: 'Negra',
      shelf: 'Abajo',
    });
    edit.editor()!.form.patchValue({ room: '', bookcase: ' ', shelf: ' ' });
    edit.editor()!.submit();
    const put = http.expectOne('/api/books/1');
    expect(put.request.body).toMatchObject({ room: null, bookcase: null, shelf: null });
    put.flush(testBook());
    await stable();
    request().flush(testBookPage());
    await stable();
    const again = await harness.navigateByUrl('/books/1/edit?room=Sal%C3%B3n&shelf=3', BookEdit);
    http.expectOne('/api/books/1').flush(testBook());
    await stable();
    again.editor()!.cancel();
    await stable();
    expect(params()).toEqual({ room: 'Salón', shelf: '3' });
    request().flush(testBookPage());
    http.expectNone((req) => req.method === 'PUT');
  });

  it('import links/return preserve physical filter context and start with no batch or requests', async () => {
    await loaded('/books?page=2&room=Sal%C3%B3n&bookcase=Billy&shelf=3');
    const context = params();
    link('Importar ISBN').click();
    await stable();
    expect(params()).toEqual(context);
    const page = harness.routeDebugElement!.componentInstance as BookImport;
    expect(page.rows()).toEqual([]);
    http.expectNone(() => true);
    link('Volver al catálogo').click();
    await stable();
    expect(params()).toEqual(context);
    const req = request();
    expect(req.request.params.get('bookcase')).toBe('Billy');
    req.flush(testBookPage());
  });

  it.each([
    [{ room: 'Salón', bookcase: 'Billy', shelf: '3' }, ['Habitación', 'Estantería', 'Balda']],
    [{ room: 'Salón' }, ['Habitación']],
    [{ bookcase: 'Negra' }, ['Estantería']],
    [{ shelf: 'Superior' }, ['Balda']],
    [{}, []],
  ])(
    'detail uses explicit labels and no absent fields or placeholder %j',
    async (location, labels) => {
      await harness.navigateByUrl('/books/1', BookDetail);
      http.expectOne('/api/books/1').flush(testBook(location));
      await stable();
      const section = harness.routeNativeElement!.querySelector(
        '[aria-labelledby="location-heading"]',
      );
      if (!labels.length) expect(section).toBeNull();
      else
        expect(Array.from(section!.querySelectorAll('dt')).map((item) => item.textContent)).toEqual(
          labels,
        );
      expect(harness.routeNativeElement!.textContent).not.toContain('Sin ubicación');
    },
  );
});
