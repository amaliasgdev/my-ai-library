import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { testSaga, testSagaPage } from '../../models/saga.testing';
import { SagasList } from './sagas-list';

describe('SagasList', () => {
  let fixture: ComponentFixture<SagasList>;
  let page: SagasList;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      imports: [SagasList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params.asObservable() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  function create(query: Record<string, string> = {}): void {
    params.next(convertToParamMap(query));
    fixture = TestBed.createComponent(SagasList);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  }

  function pending() {
    return http.expectOne((request) => request.url === '/api/sagas');
  }

  function lastQuery(): Record<string, string> {
    const call = navigate.mock.calls.at(-1);
    return ((call?.[1] as { queryParams?: Record<string, string> } | undefined)?.queryParams ??
      {}) as Record<string, string>;
  }

  function commitNavigation(): void {
    params.next(convertToParamMap(lastQuery()));
  }

  it('loads the first page with deterministic defaults and settles after one request', () => {
    create();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Cargando sagas');
    const request = pending();
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('name');
    expect(request.request.params.get('direction')).toBe('ASC');
    expect(request.request.params.has('name')).toBe(false);
    request.flush(testSagaPage());
    fixture.detectChanges();
    expect(element.querySelectorAll('mat-card.saga-card')).toHaveLength(1);
    http.expectNone((candidate) => candidate.url === '/api/sagas');
  });

  it('restores name, zero-based page and size from a shareable URL', () => {
    create({ name: '  Vampiros  ', page: '1', size: '10' });
    expect(navigate).toHaveBeenCalledWith(['/sagas'], {
      queryParams: { page: '1', size: '10', name: 'Vampiros' },
      replaceUrl: true,
    });
    commitNavigation();
    const request = pending();
    expect(request.request.params.get('name')).toBe('Vampiros');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('10');
    request.flush(
      testSagaPage({ page: 1, size: 10, content: [testSaga({ id: 7, name: 'Vampiros' })] }),
    );
    fixture.detectChanges();
    expect(page.query()).toEqual({ page: 1, size: 10, name: 'Vampiros' });
    expect(page.searchForm.controls.name.value).toBe('Vampiros');
    const link = element.querySelector<HTMLAnchorElement>('a[aria-label="Ver saga Vampiros"]')!;
    expect(link.getAttribute('href')).toBe('/sagas/7?page=1&size=10&name=Vampiros');
  });

  it('normalizes invalid URL parameters once and replaces the URL without duplicate GETs', () => {
    create({ page: '-1', size: '30', name: '   ', unknown: 'x' });
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/sagas'], { queryParams: {}, replaceUrl: true });
    commitNavigation();
    const request = pending();
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.has('name')).toBe(false);
    request.flush(testSagaPage());
    fixture.detectChanges();
    expect(element.querySelectorAll('mat-card.saga-card')).toHaveLength(1);
    http.expectNone((candidate) => candidate.url === '/api/sagas');
  });

  it('searches only on explicit submit and persists the name in the URL', () => {
    create();
    pending().flush(testSagaPage());
    fixture.detectChanges();
    page.searchForm.controls.name.setValue('bruma');
    fixture.detectChanges();
    http.expectNone((request) => request.url === '/api/sagas');

    page.submitSearch();
    expect(navigate).toHaveBeenCalledWith(['/sagas'], { queryParams: { name: 'bruma' } });
    commitNavigation();
    const request = pending();
    expect(request.request.params.get('name')).toBe('bruma');
    expect(request.request.params.get('page')).toBe('0');
    request.flush(testSagaPage({ content: [], totalElements: 0, totalPages: 0 }));
    fixture.detectChanges();
    expect(element.textContent).toContain('No se encontraron sagas');
  });

  it('clears the search through the URL and restores the first page', () => {
    create({ name: 'Vampiros', page: '1' });
    pending().flush(testSagaPage({ page: 1, totalElements: 30, totalPages: 2 }));
    fixture.detectChanges();
    page.clearSearch();
    expect(navigate).toHaveBeenCalledWith(['/sagas'], { queryParams: {} });
    commitNavigation();
    const request = pending();
    expect(request.request.params.has('name')).toBe(false);
    expect(request.request.params.get('page')).toBe('0');
    request.flush(testSagaPage());
  });

  it('persists page and size changes and resets to page zero on size changes', () => {
    create();
    pending().flush(
      testSagaPage({
        content: [testSaga(), testSaga({ id: 2 })],
        totalElements: 25,
        totalPages: 2,
      }),
    );
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MatPaginator))).not.toBeNull();

    page.onPageChange({ pageIndex: 1, pageSize: 20, length: 25 } as PageEvent);
    expect(navigate).toHaveBeenCalledWith(['/sagas'], { queryParams: { page: '1' } });
    commitNavigation();
    const second = pending();
    expect(second.request.params.get('page')).toBe('1');
    second.flush(testSagaPage({ page: 1, totalElements: 25, totalPages: 2 }));

    page.onPageChange({ pageIndex: 1, pageSize: 50, length: 25 } as PageEvent);
    expect(navigate).toHaveBeenCalledWith(['/sagas'], { queryParams: { size: '50' } });
    commitNavigation();
    const resized = pending();
    expect(resized.request.params.get('page')).toBe('0');
    expect(resized.request.params.get('size')).toBe('50');
    resized.flush(testSagaPage({ size: 50, totalElements: 25, totalPages: 1 }));
  });

  it('reloads the same applied URL on retry without navigating', () => {
    create({ name: 'Vampiros', page: '1', size: '10' });
    pending().flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'El servidor no pudo cargar las sagas',
    );
    page.retry();
    const retry = pending();
    expect(retry.request.method).toBe('GET');
    expect(retry.request.params.get('name')).toBe('Vampiros');
    expect(retry.request.params.get('page')).toBe('1');
    expect(retry.request.params.get('size')).toBe('10');
    retry.flush(testSagaPage({ page: 1, size: 10 }));
    fixture.detectChanges();
    expect(element.querySelectorAll('mat-card.saga-card')).toHaveLength(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a placeholder when the representative image fails', () => {
    create();
    pending().flush(
      testSagaPage({
        content: [testSaga({ imageUrl: 'https://example.test/broken.jpg' })],
      }),
    );
    fixture.detectChanges();
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.saga-cover')?.textContent).toContain('Sin imagen');
  });

  it('keeps accessible labels and the create link', () => {
    create();
    pending().flush(testSagaPage());
    fixture.detectChanges();
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Mis sagas');
    expect(element.querySelector('a[href="/sagas/new"]')).not.toBeNull();
    expect(element.querySelector('label')?.textContent).toContain('Nombre');
    expect(element.querySelector('a[aria-label^="Ver saga "]')).not.toBeNull();
  });
});
