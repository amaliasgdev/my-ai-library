import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { provideRouter } from '@angular/router';
import { BookCatalogSort } from '../../models/book.models';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';

describe('BooksCatalog sorting', () => {
  let fixture: ComponentFixture<BooksCatalog>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BooksCatalog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BooksCatalog);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function listRequest() {
    return http.expectOne((req) => req.url === '/api/books');
  }
  function searchRequest() {
    return http.expectOne((req) => req.url === '/api/books/search');
  }
  function loadList(page = 0, size = 20) {
    listRequest().flush(
      testBookPage({ page, size, totalElements: 121, totalPages: Math.ceil(121 / size) }),
    );
    fixture.detectChanges();
  }
  async function selects() {
    const loader = TestbedHarnessEnvironment.loader(fixture);
    return loader.getAllHarnesses(MatSelectHarness);
  }
  async function orderBy(label: string) {
    const [field] = await selects();
    await field.clickOptions({ text: label });
  }
  async function descending() {
    const [, direction] = await selects();
    await direction.clickOptions({ text: 'Descendente' });
  }
  function submitSearch(title = 'Dune') {
    fixture.componentInstance.searchForm.controls.title.setValue(title);
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }
  function expectSort(
    request: ReturnType<typeof listRequest>,
    sortBy: BookCatalogSort['sortBy'],
    direction = 'ASC',
  ) {
    expect(request.request.params.get('sortBy')).toBe(sortBy);
    expect(request.request.params.get('direction')).toBe(direction);
  }
  async function deleteFirstBook() {
    (element.querySelector('app-book-card button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ selector: '.confirm-delete' }))).click();
    await vi.waitFor(() => expect(fixture.componentInstance.deletingId()).not.toBeNull());
    await fixture.whenStable();
    return http.expectOne('/api/books/1');
  }

  it('should initially request title ASC and expose only the five user fields and two directions', async () => {
    const request = listRequest();
    expectSort(request, 'title');
    request.flush(testBookPage());
    fixture.detectChanges();
    expect(fixture.componentInstance.currentSort()).toEqual({ sortBy: 'title', direction: 'ASC' });
    const [field, direction] = await selects();
    expect(await field.getValueText()).toBe('Título');
    expect(await direction.getValueText()).toBe('Ascendente');
    await field.open();
    expect(await Promise.all((await field.getOptions()).map((option) => option.getText()))).toEqual(
      ['Título', 'Autor', 'Fecha de creación', 'Estado de lectura', 'Valoración'],
    );
    await field.close();
    await direction.open();
    expect(
      await Promise.all((await direction.getOptions()).map((option) => option.getText())),
    ).toEqual(['Ascendente', 'Descendente']);
    await direction.close();
    expect(element.querySelector('#sort-heading')?.textContent).toBe('Ordenar libros');
    expect(element.querySelectorAll('.sort-controls mat-label')[0].textContent).toBe('Ordenar por');
    expect(element.querySelectorAll('.sort-controls mat-label')[1].textContent).toBe('Dirección');
    expect(element.querySelector('form .sort-controls')).toBeNull();
    http.expectNone((req) => req.method === 'GET');
  });

  it.each([
    ['Autor', 'author'],
    ['Fecha de creación', 'createdAt'],
    ['Estado de lectura', 'readingStatus'],
    ['Valoración', 'rating'],
  ] as const)(
    'should immediately request %s with page 0 and retain page size',
    async (label, value) => {
      loadList(2, 50);
      await orderBy(label);
      const request = listRequest();
      expectSort(request, value);
      expect(request.request.params.get('page')).toBe('0');
      expect(request.request.params.get('size')).toBe('50');
      expect(element.querySelector('mat-spinner')).not.toBeNull();
      expect(element.querySelector('app-book-card')).toBeNull();
      request.flush(testBookPage({ size: 50 }));
      await fixture.whenStable();
      expect(fixture.componentInstance.currentSort()).toEqual({ sortBy: value, direction: 'ASC' });
    },
  );

  it('should change direction immediately while keeping the selected field', async () => {
    loadList();
    await orderBy('Autor');
    loadList(2, 50);
    await descending();
    const request = listRequest();
    expectSort(request, 'author', 'DESC');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('50');
    request.flush(testBookPage({ size: 50 }));
  });

  it('should not request again for the same field or direction, including direct handlers', async () => {
    loadList();
    await orderBy('Título');
    const [, direction] = await selects();
    await direction.clickOptions({ text: 'Ascendente' });
    fixture.componentInstance.onSortByChange('title');
    fixture.componentInstance.onSortDirectionChange('ASC');
    http.expectNone((req) => req.method === 'GET');
  });

  it('should retain applied search, not unsubmitted input edits, when changing sort', async () => {
    loadList();
    submitSearch();
    searchRequest().flush(testBookPage({ page: 2, size: 50, totalElements: 121, totalPages: 3 }));
    await fixture.whenStable();
    fixture.componentInstance.searchForm.controls.title.setValue('Not submitted');
    await orderBy('Valoración');
    const field = searchRequest();
    expectSort(field, 'rating');
    expect(field.request.params.get('title')).toBe('Dune');
    expect(field.request.params.get('page')).toBe('0');
    expect(field.request.params.get('size')).toBe('50');
    field.flush(testBookPage({ size: 50 }));
    await fixture.whenStable();
    await descending();
    const direction = searchRequest();
    expectSort(direction, 'rating', 'DESC');
    expect(direction.request.params.get('title')).toBe('Dune');
    direction.flush(testBookPage({ size: 50 }));
    expect(fixture.componentInstance.currentSearch()).toEqual({ title: 'Dune' });
    expect(fixture.componentInstance.searchForm.controls.title.value).toBe('Not submitted');
    http.expectNone((req) => req.url === '/api/books');
  });

  it('should retain selected sorting for a new search and when clearing search', async () => {
    loadList();
    await orderBy('Valoración');
    loadList(0, 50);
    await descending();
    loadList(0, 50);
    submitSearch();
    const request = searchRequest();
    expectSort(request, 'rating', 'DESC');
    request.flush(testBookPage({ page: 1, size: 50 }));
    await fixture.whenStable();
    const clear = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatButtonHarness.with({ text: 'Limpiar búsqueda' }),
    );
    await clear.click();
    const listing = listRequest();
    expectSort(listing, 'rating', 'DESC');
    expect(listing.request.params.get('page')).toBe('0');
    expect(listing.request.params.get('size')).toBe('50');
    expect(fixture.componentInstance.currentSearch()).toBeNull();
    expect(fixture.componentInstance.searchForm.getRawValue()).toEqual({
      title: '',
      author: '',
      isbn: '',
    });
    listing.flush(testBookPage({ size: 50 }));
  });

  it.each([false, true])(
    'should retain sort when paginating and changing page size (search=%s)',
    async (search) => {
      loadList();
      await orderBy('Autor');
      loadList();
      await descending();
      loadList();
      if (search) {
        submitSearch();
        searchRequest().flush(testBookPage({ totalElements: 121, totalPages: 7 }));
        await fixture.whenStable();
      }
      const paginator =
        await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
      await paginator.goToNextPage();
      const next = search ? searchRequest() : listRequest();
      expectSort(next, 'author', 'DESC');
      expect(next.request.params.get('page')).toBe('1');
      expect(next.request.params.get('size')).toBe('20');
      if (search) expect(next.request.params.get('title')).toBe('Dune');
      next.flush(testBookPage({ page: 1, totalElements: 121, totalPages: 7 }));
      await fixture.whenStable();
      await paginator.setPageSize(50);
      const resized = search ? searchRequest() : listRequest();
      expectSort(resized, 'author', 'DESC');
      expect(resized.request.params.get('page')).toBe('0');
      expect(resized.request.params.get('size')).toBe('50');
      if (search) expect(resized.request.params.get('title')).toBe('Dune');
      resized.flush(testBookPage({ size: 50 }));
    },
  );

  it('should cancel older GETs when changing order and preserve exact backend item order', async () => {
    const initial = listRequest();
    await orderBy('Valoración');
    expect(initial.cancelled).toBe(true);
    const previous = listRequest();
    await descending();
    expect(previous.cancelled).toBe(true);
    const newest = listRequest();
    expectSort(newest, 'rating', 'DESC');
    newest.flush(
      testBookPage({
        content: [
          testBook({ id: 2, title: 'Null first', rating: null }),
          testBook({ id: 1, title: 'Rated second', rating: 5 }),
        ],
      }),
    );
    await fixture.whenStable();
    expect(
      Array.from(element.querySelectorAll('app-book-card h2')).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Null first', 'Rated second']);
  });

  it('should use backend order for readingStatus rather than a frontend lifecycle order', async () => {
    loadList();
    await orderBy('Estado de lectura');
    listRequest().flush(
      testBookPage({
        content: [
          testBook({ id: 2, title: 'Abandoned first', readingStatus: 'ABANDONED' }),
          testBook({ id: 1, title: 'To read second', readingStatus: 'TO_READ' }),
        ],
      }),
    );
    await fixture.whenStable();
    expect(
      Array.from(element.querySelectorAll('app-book-card h2')).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Abandoned first', 'To read second']);
  });

  it.each([false, true])(
    'should retry the exact failed query with sorting (search=%s)',
    async (search) => {
      loadList();
      await orderBy('Valoración');
      loadList();
      await descending();
      loadList();
      if (search) {
        submitSearch();
        searchRequest().flush(testBookPage({ totalElements: 41, totalPages: 3 }));
        await fixture.whenStable();
      }
      fixture.componentInstance.onPageChange({ pageIndex: 1, pageSize: 20, length: 41 });
      const failed = search ? searchRequest() : listRequest();
      expectSort(failed, 'rating', 'DESC');
      failed.flush({}, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      fixture.componentInstance.searchForm.controls.title.setValue('Not applied');
      await (
        await TestbedHarnessEnvironment.loader(fixture).getHarness(
          MatButtonHarness.with({ text: 'Reintentar' }),
        )
      ).click();
      const retry = search ? searchRequest() : listRequest();
      expect(retry.request.urlWithParams).toBe(failed.request.urlWithParams);
      retry.flush(testBookPage({ page: 1 }));
    },
  );

  it.each([false, true])(
    'should reload after DELETE with the same sort, query, page and size (search=%s)',
    async (search) => {
      loadList();
      await orderBy('Valoración');
      loadList();
      await descending();
      loadList(1, 50);
      if (search) {
        submitSearch();
        searchRequest().flush(testBookPage({ page: 1, size: 50 }));
        await fixture.whenStable();
      }
      const deletion = await deleteFirstBook();
      const [field, direction] = await selects();
      expect(await field.isDisabled()).toBe(true);
      expect(await direction.isDisabled()).toBe(true);
      fixture.componentInstance.onSortByChange('author');
      fixture.componentInstance.onSortDirectionChange('ASC');
      http.expectNone((req) => req.method === 'GET');
      expect(fixture.componentInstance.currentSort()).toEqual({
        sortBy: 'rating',
        direction: 'DESC',
      });
      expect(element.querySelector('a')?.getAttribute('href')).toBe('/books/new');
      deletion.flush(null, { status: 204, statusText: 'No Content' });
      const reload = search ? searchRequest() : listRequest();
      expectSort(reload, 'rating', 'DESC');
      expect(reload.request.params.get('page')).toBe('1');
      expect(reload.request.params.get('size')).toBe('50');
      if (search) expect(reload.request.params.get('title')).toBe('Dune');
      reload.flush(testBookPage({ page: 1, size: 50, content: [testBook({ id: 2 })] }));
      await fixture.whenStable();
      expect(await field.isDisabled()).toBe(false);
      expect(await direction.isDisabled()).toBe(false);
    },
  );

  it.each([false, true])(
    'should preserve sort and query when DELETE falls back one page (search=%s)',
    async (search) => {
      loadList();
      await orderBy('Fecha de creación');
      loadList();
      await descending();
      loadList(2);
      if (search) {
        submitSearch();
        searchRequest().flush(testBookPage({ page: 2, totalElements: 41, totalPages: 3 }));
        await fixture.whenStable();
      }
      const deletion = await deleteFirstBook();
      deletion.flush(null, { status: 204, statusText: 'No Content' });
      const current = search ? searchRequest() : listRequest();
      expectSort(current, 'createdAt', 'DESC');
      expect(current.request.params.get('page')).toBe('2');
      current.flush(testBookPage({ page: 2, content: [], totalElements: 40, totalPages: 2 }));
      const previous = search ? searchRequest() : listRequest();
      expectSort(previous, 'createdAt', 'DESC');
      expect(previous.request.params.get('page')).toBe('1');
      if (search) expect(previous.request.params.get('title')).toBe('Dune');
      previous.flush({}, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      await (
        await TestbedHarnessEnvironment.loader(fixture).getHarness(
          MatButtonHarness.with({ text: 'Reintentar' }),
        )
      ).click();
      const retry = search ? searchRequest() : listRequest();
      expect(retry.request.urlWithParams).toBe(previous.request.urlWithParams);
      retry.flush(testBookPage({ page: 1, totalElements: 40, totalPages: 2 }));
    },
  );
});
