import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { provideRouter } from '@angular/router';
import { completeMembershipQueries } from '../../../reading-list/reading-list-membership.testing';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';
import {
  provideCatalogRoutingTesting,
  setCatalogPageTesting,
} from './books-catalog-routing.testing';

describe('BooksCatalog compact cards (8 and 10 per row)', () => {
  let fixture: ComponentFixture<BooksCatalog>;
  let element: HTMLElement;
  let http: HttpTestingController;
  const books = () => [testBook({ id: 1, title: 'Uno' }), testBook({ id: 2, title: 'Dos' })];
  const response = (page = 0) =>
    testBookPage({ content: books(), page, size: 20, totalElements: 45, totalPages: 3 });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BooksCatalog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideCatalogRoutingTesting(),
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
    setCatalogPageTesting(0, 20);
    listRequest().flush(response());
    completeMembershipQueries(http);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    completeMembershipQueries(http);
    http.verify();
  });

  function listRequest() {
    return http.expectOne((req) => req.url === '/api/books');
  }
  const noCatalogRequests = () =>
    http.expectNone((req) => req.url !== '/api/reading-list/membership');
  const loader = () => TestbedHarnessEnvironment.loader(fixture);
  const grid = () => element.querySelector<HTMLUListElement>('ul.book-grid')!;
  const cards = () => Array.from(element.querySelectorAll('app-book-card'));
  async function choose(label: string) {
    const select = await loader().getHarness(
      MatSelectHarness.with({ selector: '.cards-per-row mat-select' }),
    );
    await select.clickOptions({ text: label });
    fixture.detectChanges();
  }
  const menuOf = (title: string) =>
    loader().getHarness(MatMenuHarness.with({ selector: `[aria-label="Acciones de ${title}"]` }));
  async function itemTexts(title: string) {
    const menu = await menuOf(title);
    await menu.open();
    const texts = await Promise.all((await menu.getItems()).map((item) => item.getText()));
    await menu.close();
    return texts;
  }

  it.each([8, 10])(
    'uses the compact card for %s columns and keeps the grid responsive',
    async (n) => {
      await choose(`${n} tarjetas por fila`);
      expect(grid().classList.contains('fixed-columns')).toBe(true);
      expect(grid().classList.contains('compact-columns')).toBe(true);
      expect(grid().style.getPropertyValue('--book-columns')).toBe(String(n));
      expect(element.querySelectorAll('app-book-card .compact-card')).toHaveLength(2);
      for (const card of cards()) {
        expect(card.querySelector('.cover')).not.toBeNull();
        expect(card.querySelector('h2')?.getAttribute('title')).toBe(
          card.querySelector('h2')?.textContent,
        );
        expect(card.querySelector('app-star-rating, mat-select, .date-actions')).toBeNull();
      }
    },
  );

  it.each([
    'Automático',
    '2 tarjetas por fila',
    '3 tarjetas por fila',
    '4 tarjetas por fila',
    '5 tarjetas por fila',
    '6 tarjetas por fila',
  ])('keeps the full card untouched for %s', async (label) => {
    await choose(label);
    expect(grid().classList.contains('compact-columns')).toBe(false);
    expect(element.querySelector('.compact-card')).toBeNull();
    for (const card of cards()) {
      expect(card.querySelectorAll('app-star-rating button[role="radio"]')).toHaveLength(5);
      expect(card.querySelectorAll('mat-select')).toHaveLength(1);
      expect(card.querySelectorAll('mat-card-actions a, mat-card-actions button')).toHaveLength(3);
      expect(card.querySelector('.compact-menu-trigger')).toBeNull();
    }
  });

  it('shows the cover first, a brief title and an accessible link to the detail', async () => {
    await choose('8 tarjetas por fila');
    const first = cards()[0];
    const detail = first.querySelector<HTMLAnchorElement>('a.compact-detail')!;
    expect(detail.textContent?.trim()).toBe('Ver detalle');
    expect(detail.getAttribute('aria-label')).toBe('Ver detalle de Uno');
    expect(detail.getAttribute('href')).toBe('/books/1');
    expect(first.querySelector('.cover-fallback')?.textContent).toBe('Sin portada');
    expect(first.querySelector('h2')?.textContent).toBe('Uno');
    fixture.componentRef.changeDetectorRef.detectChanges();
    expect(first.querySelector('.compact-menu-trigger')?.getAttribute('aria-label')).toBe(
      'Acciones de Uno',
    );
  });

  it('keeps every existing action available from the accessible menu', async () => {
    await choose('10 tarjetas por fila');
    expect(await itemTexts('Uno')).toEqual([
      'Editar',
      'Estado de lectura: Por leer',
      'Valoración: Sin valorar',
      'Empezar lectura',
      'Finalizar lectura (fecha de hoy)',
      'Gestionar fechas',
      'Añadir a lista de lectura',
      'Eliminar',
    ]);
    const menu = await menuOf('Uno');
    await menu.open();
    const edit = document.querySelector('a.mat-mdc-menu-item');
    expect(edit?.getAttribute('href')).toBe('/books/1/edit');
    expect(edit?.getAttribute('aria-label')).toBe('Editar Uno');
    await menu.close();
  });

  it('changes the reading status from the menu without altering dates and restores on failure', async () => {
    await choose('8 tarjetas por fila');
    const menu = await menuOf('Uno');
    await menu.clickItem({ text: /^Estado de lectura/ }, { text: 'Leyendo' });
    const patch = http.expectOne('/api/books/1/reading-status');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ readingStatus: 'READING' });
    patch.flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cards()[0].querySelector('[role="alert"]')?.textContent).toContain(
      'El servidor no pudo actualizar el libro',
    );
    expect((await itemTexts('Uno'))[1]).toBe('Estado de lectura: Por leer');
    http.expectNone((req) => req.method === 'GET' && req.url !== '/api/reading-list/membership');
  });

  it('marks the confirmed value of the status and rating submenus as checked radios', async () => {
    await choose('8 tarjetas por fila');
    const menu = await menuOf('Uno');
    await menu.open();
    const [, status, rating] = await menu.getItems();
    await status.click();
    const statusItems = Array.from(
      document.querySelectorAll<HTMLElement>('.mat-mdc-menu-panel [role="menuitemradio"]'),
    );
    expect(statusItems.map((item) => item.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    await menu.close();
    await menu.open();
    await (await menu.getItems())[2].click();
    const ratingItems = Array.from(
      document.querySelectorAll<HTMLElement>('.mat-mdc-menu-panel [role="menuitemradio"]'),
    ).slice(-6);
    expect(ratingItems.map((item) => item.textContent?.trim())).toEqual([
      'Sin valorar',
      '1 estrella',
      '2 estrellas',
      '3 estrellas',
      '4 estrellas',
      '5 estrellas',
    ]);
    expect(ratingItems[0].getAttribute('aria-checked')).toBe('true');
    expect(await rating.getText()).toBe('Valoración: Sin valorar');
    await menu.close();
  });

  it('rates and removes the rating from the menu through the existing endpoints', async () => {
    await choose('8 tarjetas por fila');
    await (await menuOf('Uno')).clickItem({ text: /^Valoración/ }, { text: '3 estrellas' });
    const put = http.expectOne('/api/books/1/rating');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ rating: 3 });
    put.flush({ ...books()[0], rating: 3 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((await itemTexts('Uno'))[2]).toBe('Valoración: 3 de 5');
    await (await menuOf('Uno')).clickItem({ text: /^Valoración/ }, { text: 'Sin valorar' });
    const remove = http.expectOne('/api/books/1/rating');
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body).toBeNull();
    remove.flush(null, { status: 204, statusText: 'No Content' });
    listRequest().flush(response());
    await fixture.whenStable();
    expect(cards()[0].querySelector('h2')?.textContent).toBe('Uno');
  });

  it('starts and finishes reading with the local date and never touches the rating', async () => {
    await choose('8 tarjetas por fila');
    await (await menuOf('Uno')).clickItem({ text: 'Empezar lectura' });
    const start = http.expectOne('/api/books/1/start-reading');
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    start.flush({ ...books()[0], readingStatus: 'READING', startedOn: '2026-01-01' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((await itemTexts('Uno')).slice(3, 5)).toEqual([
      'Finalizar lectura (fecha de hoy)',
      'Gestionar fechas',
    ]);
    await (await menuOf('Uno')).clickItem({ text: /^Finalizar lectura/ });
    const finish = http.expectOne('/api/books/1/finish-reading');
    expect(finish.request.method).toBe('POST');
    finish.flush({ ...books()[0], readingStatus: 'READ', rating: null });
    http.expectNone((req) => req.url.includes('/rating'));
  });

  it('opens the existing dates and delete dialogs from the menu', async () => {
    await choose('10 tarjetas por fila');
    const dialogs = TestBed.inject(MatDialog);
    await (await menuOf('Uno')).clickItem({ text: 'Gestionar fechas' });
    await fixture.whenStable();
    expect(dialogs.openDialogs).toHaveLength(1);
    dialogs.closeAll();
    await vi.waitFor(() => expect(dialogs.openDialogs).toHaveLength(0));
    await (await menuOf('Dos')).clickItem({ text: 'Eliminar' });
    await fixture.whenStable();
    expect(dialogs.openDialogs).toHaveLength(1);
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('adds the book to the reading list only from its explicit menu action', async () => {
    await choose('8 tarjetas por fila');
    http.expectNone((req) => req.method === 'POST');
    await (await menuOf('Uno')).clickItem({ text: 'Añadir a lista de lectura' });
    const add = http.expectOne(
      (req) => req.method === 'POST' && req.url === '/api/reading-list/items',
    );
    expect(add.request.body).toMatchObject({ bookId: 1 });
    add.flush(
      { revision: '1', item: { id: 9, bookId: 1, position: 1, addedAt: '2026-01-01' } },
      { status: 201, statusText: 'Created' },
    );
  });

  it('blocks the menu and the detail link while that book has a pending write', async () => {
    await choose('8 tarjetas por fila');
    fixture.componentInstance.updateReadingStatus({ id: 1, status: 'READING' });
    fixture.detectChanges();
    const first = cards()[0];
    expect(first.querySelector<HTMLButtonElement>('.compact-menu-trigger')?.disabled).toBe(true);
    expect(first.querySelector('a.compact-detail')?.getAttribute('aria-disabled')).toBe('true');
    expect(first.querySelector('.compact-progress')?.textContent?.trim()).toBe(
      'Actualizando estado…',
    );
    expect(cards()[1].querySelector<HTMLButtonElement>('.compact-menu-trigger')?.disabled).toBe(
      false,
    );
    http
      .expectOne('/api/books/1/reading-status')
      .flush({ ...books()[0], readingStatus: 'READING' });
  });

  it('never reloads or changes search, filters, sort or pagination when switching density', async () => {
    const paginator = await loader().getHarness(MatPaginatorHarness);
    const before = {
      params: fixture.componentInstance.catalogParams(),
      sort: fixture.componentInstance.currentSort(),
      search: fixture.componentInstance.currentSearch(),
      filters: fixture.componentInstance.currentFilters(),
      range: await paginator.getRangeLabel(),
      titles: cards().map((card) => card.querySelector('h2')?.textContent),
    };
    const hosts = cards();
    for (const label of [
      '8 tarjetas por fila',
      '10 tarjetas por fila',
      '2 tarjetas por fila',
      'Automático',
    ]) {
      await choose(label);
      noCatalogRequests();
    }
    expect({
      params: fixture.componentInstance.catalogParams(),
      sort: fixture.componentInstance.currentSort(),
      search: fixture.componentInstance.currentSearch(),
      filters: fixture.componentInstance.currentFilters(),
      range: await paginator.getRangeLabel(),
      titles: cards().map((card) => card.querySelector('h2')?.textContent),
    }).toEqual(before);
    expect(cards()).toEqual(hosts);
  });

  it('keeps the compact density across sort changes and pagination', async () => {
    await choose('10 tarjetas por fila');
    fixture.componentInstance.onSortByChange('author');
    listRequest().flush(response());
    fixture.detectChanges();
    expect(grid().style.getPropertyValue('--book-columns')).toBe('10');
    expect(element.querySelectorAll('.compact-card')).toHaveLength(2);
    const paginator = await loader().getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    const next = listRequest();
    expect(next.request.params.get('page')).toBe('1');
    expect(next.request.params.get('sortBy')).toBe('author');
    next.flush(response(1));
    completeMembershipQueries(http);
    fixture.detectChanges();
    expect(grid().classList.contains('compact-columns')).toBe(true);
    expect(await itemTexts('Uno')).toContain('Gestionar fechas');
  });

  it('declares compact styles that clamp the title and add no horizontal scrolling', () => {
    const css = Array.from(document.head.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .filter((text) => text.includes('compact'))
      .join('')
      .replace(/\s+/g, '');
    expect(css).toContain('.compact-content');
    expect(css).toMatch(/line-clamp:3/);
    expect(css).toContain('--fixed-card-min:6rem');
    expect(css).not.toContain('overflow-x');
  });
});
