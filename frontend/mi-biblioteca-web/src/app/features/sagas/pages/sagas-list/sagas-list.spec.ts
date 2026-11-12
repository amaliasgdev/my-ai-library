import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { provideRouter } from '@angular/router';
import { testSaga, testSagaPage } from '../../models/saga.testing';
import { SagasList } from './sagas-list';

describe('SagasList', () => {
  let fixture: ComponentFixture<SagasList>;
  let page: SagasList;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SagasList],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SagasList);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function pending() {
    return http.expectOne((request) => request.url === '/api/sagas');
  }

  it('loads the first page with deterministic defaults and announces loading', () => {
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Cargando sagas');
    const request = pending();
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('name');
    expect(request.request.params.get('direction')).toBe('ASC');
    expect(request.request.params.has('name')).toBe(false);
    request.flush(testSagaPage());
    fixture.detectChanges();
    expect(element.querySelectorAll('mat-card.saga-card')).toHaveLength(1);
  });

  it('renders cards with totals, library coverage, pending volumes and reading progress', () => {
    pending().flush(
      testSagaPage({
        content: [
          testSaga({
            id: 7,
            name: 'Nacidos de la bruma',
            author: 'Brandon Sanderson',
            progress: {
              total: 5,
              linked: 3,
              pending: 2,
              read: 1,
              reading: 1,
              toRead: 1,
              abandoned: 0,
            },
          }),
        ],
      }),
    );
    fixture.detectChanges();
    const card = element.querySelector('.saga-card')!;
    expect(card.textContent).toContain('Nacidos de la bruma');
    expect(card.textContent).toContain('Brandon Sanderson');
    expect(card.textContent).toContain('5');
    expect(card.textContent).toContain('3');
    expect(card.textContent).toContain('2');
    expect(card.textContent).toContain('1 de 5 volúmenes leídos');
    expect(card.querySelector('mat-progress-bar')).not.toBeNull();
    const link = card.querySelector<HTMLAnchorElement>('a[aria-label^="Ver saga "]')!;
    expect(link.textContent?.trim()).toBe('Ver saga');
    expect(link.getAttribute('href')).toBe('/sagas/7');
    expect(link.getAttribute('aria-label')).toBe('Ver saga Nacidos de la bruma');
  });

  it('distinguishes an empty library from a search without results', () => {
    pending().flush(testSagaPage({ content: [], totalElements: 0, totalPages: 0 }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Todavía no has creado ninguna saga');
    expect(element.querySelector('a[href="/sagas/new"]')?.textContent?.trim()).toBe('Crear saga');

    page.searchForm.controls.name.setValue('bruma');
    fixture.detectChanges();
    http.expectNone((request) => request.url === '/api/sagas');
    page.submitSearch();
    const search = pending();
    expect(search.request.params.get('name')).toBe('bruma');
    expect(search.request.params.get('page')).toBe('0');
    search.flush(testSagaPage({ content: [], totalElements: 0, totalPages: 0 }));
    fixture.detectChanges();
    expect(element.textContent).toContain('No se encontraron sagas');
    expect(element.textContent).toContain('Limpiar búsqueda');
  });

  it('clears the applied search and requests the unfiltered first page', () => {
    pending().flush(testSagaPage());
    fixture.detectChanges();
    page.searchForm.controls.name.setValue('bruma');
    page.submitSearch();
    pending().flush(testSagaPage({ totalElements: 0, totalPages: 0, content: [] }));
    fixture.detectChanges();
    page.clearSearch();
    const request = pending();
    expect(request.request.params.has('name')).toBe(false);
    expect(request.request.params.get('page')).toBe('0');
    request.flush(testSagaPage());
  });

  it('shows an error and retries only the current list request', () => {
    pending().flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'El servidor no pudo cargar las sagas',
    );
    page.retry();
    pending().flush(testSagaPage());
    fixture.detectChanges();
    expect(element.querySelectorAll('mat-card.saga-card')).toHaveLength(1);
  });

  it('paginates and resets to page zero when the page size changes', () => {
    pending().flush(
      testSagaPage({
        content: [testSaga(), testSaga({ id: 2, name: 'Saga 2' })],
        totalElements: 25,
        totalPages: 2,
      }),
    );
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MatPaginator))).not.toBeNull();

    page.onPageChange({ pageIndex: 1, pageSize: 20, length: 25 } as PageEvent);
    const second = pending();
    expect(second.request.params.get('page')).toBe('1');
    second.flush(testSagaPage({ page: 1, totalElements: 25, totalPages: 2 }));
    fixture.detectChanges();

    page.onPageChange({ pageIndex: 1, pageSize: 50, length: 25 } as PageEvent);
    const resized = pending();
    expect(resized.request.params.get('page')).toBe('0');
    expect(resized.request.params.get('size')).toBe('50');
    resized.flush(testSagaPage({ size: 50, totalElements: 25, totalPages: 1 }));
  });

  it('shows a placeholder when the representative image fails', () => {
    pending().flush(
      testSagaPage({
        content: [testSaga({ imageUrl: 'https://example.test/broken.jpg' })],
      }),
    );
    fixture.detectChanges();
    const image = element.querySelector('img')!;
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.saga-cover')?.textContent).toContain('Sin imagen');
  });

  it('keeps the create link and search controls accessible', () => {
    pending().flush(testSagaPage());
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Mis sagas');
    expect(element.querySelector('a[href="/sagas/new"]')).not.toBeNull();
    const search = element.querySelector<HTMLInputElement>('[formControlName="name"]')!;
    expect(search).not.toBeNull();
    expect(element.querySelector('label')?.textContent).toContain('Nombre');
  });
});
