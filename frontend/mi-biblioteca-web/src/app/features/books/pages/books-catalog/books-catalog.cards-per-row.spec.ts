import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { provideRouter } from '@angular/router';
import { completeMembershipQueries } from '../../../reading-list/reading-list-membership.testing';
import {
  CARDS_PER_ROW_OPTIONS,
  CardsPerRow,
  isCardsPerRow,
  isCompactCardsPerRow,
} from '../../../../core/preferences/cards-per-row';
import { UI_PREFERENCES_STORAGE_KEY } from '../../../../core/preferences/ui-preferences.service';
import { testBook, testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';
import {
  provideCatalogRoutingTesting,
  setCatalogPageTesting,
} from './books-catalog-routing.testing';

describe('BooksCatalog cards per row', () => {
  let fixture: ComponentFixture<BooksCatalog>;
  let element: HTMLElement;
  let http: HttpTestingController;
  const books = () => [testBook({ id: 1, title: 'Uno' }), testBook({ id: 2, title: 'Dos' })];
  const response = (page = 0) =>
    testBookPage({ content: books(), page, size: 20, totalElements: 45, totalPages: 3 });

  beforeEach(() => {
    // Visual preferences persist in storage: start every test from the defaults.
    localStorage.removeItem(UI_PREFERENCES_STORAGE_KEY);
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
    fixture.detectChanges();
  });

  afterEach(() => {
    completeMembershipQueries(http);
    http.verify();
  });

  function listRequest() {
    return http.expectOne((req) => req.url === '/api/books');
  }
  const noCatalogRequests = () =>
    http.expectNone((req) => req.url !== '/api/reading-list/membership');
  const loader = () => TestbedHarnessEnvironment.loader(fixture);
  const density = () =>
    loader().getHarness(MatSelectHarness.with({ selector: '.cards-per-row mat-select' }));
  const grid = () => element.querySelector<HTMLUListElement>('ul.book-grid')!;
  const columns = () => grid().style.getPropertyValue('--book-columns');
  async function choose(label: string) {
    const select = await density();
    await select.clickOptions({ text: label });
    fixture.detectChanges();
  }
  const snapshot = async () => {
    const paginator = await loader().getHarness(MatPaginatorHarness);
    return {
      params: fixture.componentInstance.catalogParams(),
      sort: fixture.componentInstance.currentSort(),
      search: fixture.componentInstance.currentSearch(),
      filters: fixture.componentInstance.currentFilters(),
      range: await paginator.getRangeLabel(),
      pageSize: await paginator.getPageSize(),
      titles: Array.from(element.querySelectorAll('app-book-card h2')).map((h) => h.textContent),
    };
  };

  it('offers Automático and 2 to 6, 8 and 10 cards per row, defaulting to Automático', async () => {
    const select = await density();
    expect(await select.getValueText()).toBe('Automático');
    await select.open();
    expect(
      await Promise.all((await select.getOptions()).map((option) => option.getText())),
    ).toEqual([
      'Automático',
      '2 tarjetas por fila',
      '3 tarjetas por fila',
      '4 tarjetas por fila',
      '5 tarjetas por fila',
      '6 tarjetas por fila',
      '8 tarjetas por fila',
      '10 tarjetas por fila',
    ]);
    await select.close();
    expect(CARDS_PER_ROW_OPTIONS.map((option) => option.value)).toEqual([
      'auto',
      2,
      3,
      4,
      5,
      6,
      8,
      10,
    ]);
  });

  it('keeps the original responsive layout for Automático', () => {
    expect(grid().classList.contains('fixed-columns')).toBe(false);
    expect(columns()).toBe('');
    expect(fixture.componentInstance.cardsPerRow()).toBe('auto');
  });

  it.each([2, 3, 4, 5, 6, 8, 10])(
    'applies %s columns through the custom property',
    async (count) => {
      await choose(`${count} tarjetas por fila`);
      expect(grid().classList.contains('fixed-columns')).toBe(true);
      expect(columns()).toBe(String(count));
      expect(fixture.componentInstance.cardsPerRow()).toBe(count);
      await choose('Automático');
      expect(grid().classList.contains('fixed-columns')).toBe(false);
      expect(columns()).toBe('');
    },
  );

  it('never reloads, navigates or changes filters, sort, search or pagination', async () => {
    const before = await snapshot();
    const cards = Array.from(element.querySelectorAll('app-book-card'));
    for (const label of ['2 tarjetas por fila', '6 tarjetas por fila', 'Automático']) {
      await choose(label);
      noCatalogRequests();
    }
    expect(await snapshot()).toEqual(before);
    expect(Array.from(element.querySelectorAll('app-book-card'))).toEqual(cards);
  });

  it('keeps the chosen density across sort changes and pagination and keeps those states', async () => {
    await choose('4 tarjetas por fila');
    fixture.componentInstance.onSortByChange('author');
    listRequest().flush(response());
    fixture.detectChanges();
    expect(columns()).toBe('4');
    expect(fixture.componentInstance.currentSort().sortBy).toBe('author');
    const paginator = await loader().getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    const next = listRequest();
    expect(next.request.params.get('page')).toBe('1');
    expect(next.request.params.get('sortBy')).toBe('author');
    next.flush(response(1));
    fixture.detectChanges();
    expect(columns()).toBe('4');
    const before = await snapshot();
    await choose('3 tarjetas por fila');
    noCatalogRequests();
    expect(await snapshot()).toEqual(before);
    expect(before.params).toMatchObject({ page: '1', sortBy: 'author' });
  });

  it('keeps the star rating and every card action working in each density', async () => {
    for (const label of ['2 tarjetas por fila', '6 tarjetas por fila']) {
      await choose(label);
      const cards = Array.from(element.querySelectorAll('app-book-card'));
      expect(cards).toHaveLength(2);
      for (const card of cards) {
        expect(card.querySelectorAll('app-star-rating button[role="radio"]')).toHaveLength(5);
        expect(card.querySelectorAll('mat-card-actions a, mat-card-actions button')).toHaveLength(
          2,
        );
      }
    }
    element
      .querySelectorAll('app-book-card')[0]
      .querySelectorAll<HTMLButtonElement>('app-star-rating button[role="radio"]')[2]
      .click();
    const request = http.expectOne('/api/books/1/rating');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ rating: 3 });
    request.flush({ ...books()[0], rating: 3 });
    fixture.detectChanges();
    expect(columns()).toBe('6');
    expect(
      element.querySelectorAll('app-book-card')[0].querySelector('app-star-rating .summary')
        ?.textContent,
    ).toBe('3 de 5');
  });

  it('exposes an accessible labelled selector next to the book counter, with a grid icon', async () => {
    expect(element.querySelector('section.view-controls')).toBeNull();
    const toolbar = element.querySelector('.catalog-toolbar')!;
    const counter = toolbar.querySelector('.catalog-status')!;
    expect(counter.getAttribute('role')).toBe('status');
    expect(counter.textContent).toContain('Mostrando 2 de 45 libros');
    expect(toolbar.querySelector('.catalog-results-heading h2')?.textContent).toBe('Libros');
    const field = toolbar.querySelector('mat-form-field.cards-per-row')!;
    expect(counter.closest('.catalog-results-heading')).not.toBeNull();
    expect(toolbar.querySelector('.catalog-results-heading')?.nextElementSibling).toBe(field);
    const select = field.querySelector('mat-select')!;
    const label = field.querySelector('mat-label')!;
    expect(label.textContent).toBe('Tarjetas por fila');
    expect(select.getAttribute('aria-labelledby')).toContain(label.parentElement?.id ?? 'x');
    const icon = field.querySelector('mat-icon')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('svg path')).not.toBeNull();
    expect(await (await density()).isDisabled()).toBe(false);
    const harness = await density();
    await harness.open();
    expect(await harness.isOpen()).toBe(true);
    await harness.close();
  });

  it('ignores unknown density values', () => {
    const page = fixture.componentInstance;
    for (const value of [7, 9, 12, 'wide', null, undefined]) page.onCardsPerRowChange(value);
    expect(page.cardsPerRow()).toBe('auto');
    expect(['auto', 2, 6, 8, 10].every(isCardsPerRow)).toBe(true);
    expect([0, 1, 7, 9, '4', null, undefined].some(isCardsPerRow)).toBe(false);
    expect(isCompactCardsPerRow('auto')).toBe(false);
    const dense: CardsPerRow[] = [8, 10];
    const full: CardsPerRow[] = [2, 3, 4, 5, 6];
    expect(full.some(isCompactCardsPerRow)).toBe(false);
    expect(dense.every(isCompactCardsPerRow)).toBe(true);
  });

  it('declares a responsive grid that never forces a fixed number of narrow columns', () => {
    const css = Array.from(document.head.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .filter((text) => text.includes('book-grid'))
      .join('')
      .replace(/\s+/g, '');
    const gridRules = (css.match(/\.book-grid[^{]*\{[^}]*\}/g) ?? []).join('');
    expect(gridRules).toContain('repeat(auto-fill,minmax(min(100%,15rem),1fr))');
    expect(gridRules).toContain('--fixed-card-min');
    expect(gridRules).toContain('max(var(--fixed-card-min)');
    expect(gridRules).toContain('var(--book-columns)');
    // Columns are only a maximum: auto-fill drops them when a card would be below the minimum.
    expect(gridRules).not.toMatch(/repeat\(var\(--book-columns\)/);
    expect(gridRules).not.toMatch(/repeat\([2-9],/);
    expect(gridRules).not.toMatch(/repeat\(10,/);
    // Dense (compact) grids may use narrower cards and a smaller gap, but keep a minimum width.
    expect(gridRules).toMatch(/\.fixed-columns\.compact-columns[^{]*\{[^}]*--fixed-card-min:6rem/);
    expect(gridRules).toMatch(/\.fixed-columns\.compact-columns[^{]*\{[^}]*--book-gap:0\.5rem/);
    expect(gridRules).not.toContain('overflow-x');
    expect(css).not.toContain('overflow-x');
  });
});
