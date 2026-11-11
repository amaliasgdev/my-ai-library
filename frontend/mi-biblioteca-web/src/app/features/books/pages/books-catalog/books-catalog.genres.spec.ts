import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../../app.routes';
import { completeMembershipQueries } from '../../../reading-list/reading-list-membership.testing';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';

describe('catalog multi-genre filter with real Router and HTTP boundary', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;
  let page: BooksCatalog;

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
    completeMembershipQueries(http);
    http.verify();
    harness.fixture.destroy();
  });

  function request() {
    return http.expectOne((req) => req.url === '/api/books' || req.url === '/api/books/search');
  }

  function genreRequest() {
    return http.expectOne('/api/books/genres');
  }

  async function stable() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function enter(url = '/books') {
    page = await harness.navigateByUrl(url, BooksCatalog);
    await stable();
  }

  async function loaded(url = '/books') {
    await enter(url);
    request().flush(testBookPage({ totalElements: 100, totalPages: 5 }));
    await stable();
  }

  function params() {
    return router.parseUrl(router.url).queryParams;
  }

  function button(label: string) {
    return Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button'),
    ).find((item) => item.textContent?.trim() === label)!;
  }

  function searchInput(): HTMLInputElement {
    return harness.routeNativeElement!.querySelector<HTMLInputElement>('#genre-filter-search')!;
  }

  async function loadOptions(values: readonly string[] = ['Fantasía', 'Terror']) {
    searchInput().focus();
    await stable();
    genreRequest().flush([...values]);
    await stable();
  }

  function type(text: string): void {
    const input = searchInput();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function optionTexts(): string[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container mat-option.genre-option'),
    ).map((option) => option.textContent!.trim());
  }

  function toggleOption(text: string): void {
    const option = Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container mat-option.genre-option'),
    ).find((element) => element.textContent!.includes(text));
    if (!option) throw new Error(`Missing option ${text}`);
    option.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  }

  it('loads suggestions lazily from the dedicated endpoint and searches them', async () => {
    await loaded();
    expect(http.match((req) => req.url === '/api/books/genres').length).toBe(0);
    expect(searchInput().placeholder).toBe('Todos los géneros');
    await loadOptions();
    expect(harness.routeNativeElement!.textContent).toContain('Géneros seleccionados: 0 de 50');
    type('fan');
    await stable();
    expect(optionTexts()).toEqual(['Fantasía']);
  });

  it('applies repeated genre parameters with OR semantics from checkboxes', async () => {
    await loaded();
    await loadOptions();
    toggleOption('Terror');
    await stable();
    toggleOption('Fantasía');
    await stable();
    button('Aplicar filtros').click();
    await stable();
    expect(params()).toEqual({ genre: ['Fantasía', 'Terror'] });
    const req = request();
    expect(req.request.params.getAll('genre')).toEqual(['Fantasía', 'Terror']);
    expect(req.request.params.has('genreUnassigned')).toBe(false);
    req.flush(testBookPage());
  });

  it('applies Sin género alone or combined with selected genres', async () => {
    await loaded();
    const unassigned = harness.routeNativeElement!.querySelector<HTMLInputElement>(
      '.genre-unassigned input[type="checkbox"]',
    )!;
    unassigned.click();
    await stable();
    button('Aplicar filtros').click();
    await stable();
    expect(params()).toEqual({ genreUnassigned: 'true' });
    const onlyUnassigned = request();
    expect(onlyUnassigned.request.params.get('genreUnassigned')).toBe('true');
    expect(onlyUnassigned.request.params.has('genre')).toBe(false);
    onlyUnassigned.flush(testBookPage());

    await loadOptions();
    toggleOption('Terror');
    await stable();
    button('Aplicar filtros').click();
    await stable();
    expect(params()).toEqual({ genre: 'Terror', genreUnassigned: 'true' });
    const combined = request();
    expect(combined.request.params.get('genre')).toBe('Terror');
    expect(combined.request.params.get('genreUnassigned')).toBe('true');
    combined.flush(testBookPage());
  });

  it('clears only the genre draft and preserves every other applied filter', async () => {
    await loaded('/books?genre=Fantas%C3%ADa&genre=Terror&genreUnassigned=true&ratingMin=4');
    expect(page.filtersForm.controls.genre.value).toEqual({
      genres: ['Fantasía', 'Terror'],
      genreUnassigned: true,
    });
    button('Limpiar géneros').click();
    await stable();
    expect(page.filtersForm.controls.genre.value).toEqual({
      genres: [],
      genreUnassigned: false,
    });
    button('Aplicar filtros').click();
    await stable();
    expect(params()).toEqual({ ratingMin: '4' });
    const req = request();
    expect(req.request.params.has('genre')).toBe(false);
    expect(req.request.params.has('genreUnassigned')).toBe(false);
    expect(req.request.params.get('ratingMin')).toBe('4');
    req.flush(testBookPage());
  });

  it('restores repeated genres and Sin género with Back and Forward', async () => {
    const original = '/books?genre=Fantas%C3%ADa&genre=Terror&genreUnassigned=true';
    await loaded(original);
    expect(page.filtersForm.controls.genre.value).toEqual({
      genres: ['Fantasía', 'Terror'],
      genreUnassigned: true,
    });
    page.filtersForm.controls.ratingMin.setValue(4);
    page.applyFilters();
    await stable();
    request().flush(testBookPage());
    expect(params()).toEqual({
      genre: ['Fantasía', 'Terror'],
      genreUnassigned: 'true',
      ratingMin: '4',
    });

    TestBed.inject(Location).back();
    await vi.waitFor(() =>
      expect(params()).toEqual({
        genre: ['Fantasía', 'Terror'],
        genreUnassigned: 'true',
      }),
    );
    request().flush(testBookPage());
    expect(page.filtersForm.controls.genre.value).toEqual({
      genres: ['Fantasía', 'Terror'],
      genreUnassigned: true,
    });
    expect(page.filtersForm.controls.ratingMin.value).toBeNull();

    TestBed.inject(Location).forward();
    await vi.waitFor(() =>
      expect(params()).toEqual({
        genre: ['Fantasía', 'Terror'],
        genreUnassigned: 'true',
        ratingMin: '4',
      }),
    );
    request().flush(testBookPage());
    expect(page.filtersForm.controls.genre.value).toEqual({
      genres: ['Fantasía', 'Terror'],
      genreUnassigned: true,
    });
  });

  it('keeps every genre parameter through paging and sorting', async () => {
    await loaded('/books?genre=Fantas%C3%ADa&genre=Terror&genreUnassigned=true');
    page.onPageChange({ pageIndex: 1, pageSize: 20, length: 100 });
    await stable();
    const paged = request();
    expect(paged.request.params.getAll('genre')).toEqual(['Fantasía', 'Terror']);
    expect(paged.request.params.get('genreUnassigned')).toBe('true');
    expect(paged.request.params.get('page')).toBe('1');
    paged.flush(testBookPage());

    page.onSortByChange('author');
    await stable();
    const sorted = request();
    expect(sorted.request.params.getAll('genre')).toEqual(['Fantasía', 'Terror']);
    expect(sorted.request.params.get('genreUnassigned')).toBe('true');
    expect(sorted.request.params.get('sortBy')).toBe('author');
    expect(sorted.request.params.get('page')).toBe('0');
    sorted.flush(testBookPage());
    expect(params()).toEqual({
      sortBy: 'author',
      genre: ['Fantasía', 'Terror'],
      genreUnassigned: 'true',
    });
  });

  it('reloads the current suggestions when returning to the catalog after create or edit', async () => {
    await loaded();
    await loadOptions(['Terror']);
    await harness.navigateByUrl('/books/new');
    await enter('/books');
    request().flush(testBookPage());
    await stable();
    await loadOptions(['Fantasía']);
    type('ter');
    await stable();
    expect(optionTexts()).toEqual([]);
    type('fan');
    await stable();
    expect(optionTexts()).toEqual(['Fantasía']);
  });

  it('shows a safe load error and retries only the genre request', async () => {
    await loaded();
    searchInput().focus();
    await stable();
    genreRequest().flush({}, { status: 500, statusText: 'Error' });
    await stable();
    expect(harness.routeNativeElement!.textContent).toContain('No se pudieron cargar los géneros');
    expect(
      harness.routeNativeElement!.querySelector('.genre-error [role="alert"]')?.textContent,
    ).toContain('No se pudieron cargar los géneros');
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.genre-error button')!.click();
    await stable();
    genreRequest().flush(['Terror']);
    await stable();
    type('ter');
    await stable();
    expect(optionTexts()).toEqual(['Terror']);
    http.expectNone((req) => req.method === 'GET' && req.url !== '/api/reading-list/membership');
  });

  it('refreshes suggestions after deleting a book that used the only matching genre', async () => {
    await loaded();
    await loadOptions(['Fantasía', 'Terror']);
    page.openDeleteDialog(testBook());
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(page.deletingId()).toBe(1));
    http.expectOne('/api/books/1').flush(null, { status: 204, statusText: 'No Content' });
    const refreshed = genreRequest();
    refreshed.flush(['Fantasía']);
    request().flush(testBookPage());
    await stable();
    type('ter');
    await stable();
    expect(optionTexts()).toEqual([]);
    type('fan');
    await stable();
    expect(optionTexts()).toEqual(['Fantasía']);
  });
});
