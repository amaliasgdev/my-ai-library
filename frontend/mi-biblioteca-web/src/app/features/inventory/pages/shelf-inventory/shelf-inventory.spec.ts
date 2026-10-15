import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { ShelfInventory } from './shelf-inventory';
import { testInventoryHistory, testInventorySession } from '../../models/inventory.testing';
import { InventorySessionCreateDialog } from '../../components/inventory-session-create-dialog';
import { InventorySessionConfirmDialog } from '../../components/inventory-session-confirm-dialog';
import { routes } from '../../../../app.routes';

describe('ShelfInventory', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let closed: Subject<unknown>;
  const open = vi.fn();
  const close = vi.fn();
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ shelfId: '3' }));
    query = new BehaviorSubject(convertToParamMap({}));
    open.mockReset();
    close.mockReset();
    open.mockImplementation(() => {
      closed = new Subject();
      const result = closed;
      return { close, afterClosed: () => result.asObservable() };
    });
    TestBed.configureTestingModule({
      imports: [ShelfInventory],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            queryParamMap: query,
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function create() {
    const fixture = TestBed.createComponent(ShelfInventory);
    fixture.detectChanges();
    return fixture;
  }
  function get() {
    return http.expectOne((r) => r.url === '/api/shelves/3/inventory-sessions');
  }
  function loaded(active = true) {
    const fixture = create();
    get().flush(testInventoryHistory({ activeSession: active ? testInventorySession() : null }));
    fixture.detectChanges();
    return fixture;
  }
  it('both routes are lazy and inventory history uses a single composed GET', () => {
    expect(
      routes.find((r) => r.path === 'locations/shelves/:shelfId/inventory')?.loadComponent,
    ).toBeTypeOf('function');
    expect(routes.find((r) => r.path === 'inventory-sessions/:id')?.loadComponent).toBeTypeOf(
      'function',
    );
    const fixture = create();
    expect(fixture.nativeElement.textContent).toContain('Cargando inventario');
    get().flush(testInventoryHistory());
    http.expectNone(() => true);
  });
  it('renders context, active state and semantic responsive history, never a start action when active', () => {
    const fixture = loaded();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Salón > Billy > Superior');
    expect(element.textContent).toContain('Inventario en curso');
    expect(element.textContent).not.toContain('Iniciar inventario');
    expect(element.querySelector('table[aria-label]')).toBeTruthy();
    expect(element.querySelector('.mobile-label')).toBeTruthy();
    fixture.componentInstance.start();
    expect(open).not.toHaveBeenCalled();
  });
  it('errors never imply no active session; explicit retry loads empty history', () => {
    const fixture = create();
    get().flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Iniciar inventario');
    fixture.componentInstance.start();
    expect(open).not.toHaveBeenCalled();
    fixture.componentInstance.retry();
    get().flush(testInventoryHistory({ activeSession: null, content: [] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay sesiones');
    expect(fixture.nativeElement.textContent).toContain('Iniciar inventario');
  });
  it('cancel create has no HTTP; explicit confirm creates once and navigates to detail preserving context', () => {
    const fixture = loaded(false);
    const page = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.start();
    expect(open).toHaveBeenCalledWith(InventorySessionCreateDialog, expect.anything());
    closed.next(undefined);
    http.expectNone(() => true);
    page.start();
    closed.next({ notes: 'Initial' });
    const req = http.expectOne('/api/shelves/3/inventory-sessions');
    expect(req.request.body).toEqual({ notes: 'Initial' });
    page.start();
    http.expectNone(() => true);
    req.flush(testInventorySession());
    expect(navigate).toHaveBeenCalledWith(['/inventory-sessions', 7], {
      queryParams: { page: 0, size: 20 },
    });
  });
  it('create 409 refreshes active session without retry POST', () => {
    const fixture = loaded(false);
    fixture.componentInstance.start();
    closed.next({ notes: null });
    http
      .expectOne('/api/shelves/3/inventory-sessions')
      .flush({ code: 'INVENTORY_SESSION_ALREADY_ACTIVE' }, { status: 409, statusText: 'Conflict' });
    get().flush(testInventoryHistory());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Abrir sesión activa');
    http.expectNone((r) => r.method === 'POST');
  });
  it.each(['complete', 'cancel'] as const)(
    '%s requires confirmation, blocks duplicates and retries only GET after confirmed write',
    (action) => {
      const fixture = loaded();
      const page = fixture.componentInstance;
      page.closeSession(action);
      expect(open).toHaveBeenLastCalledWith(
        InventorySessionConfirmDialog,
        expect.objectContaining({ data: expect.objectContaining({ action }) }),
      );
      closed.next(false);
      http.expectNone(() => true);
      page.closeSession(action);
      closed.next(true);
      const req = http.expectOne(`/api/inventory-sessions/7/${action}`);
      page.closeSession(action);
      page.start();
      http.expectNone(() => true);
      req.flush(testInventorySession({ status: 'COMPLETED' }));
      get().flush({}, { status: 500, statusText: 'Error' });
      page.retry();
      get().flush(testInventoryHistory({ activeSession: null }));
      http.expectNone((r) => r.method === 'POST');
    },
  );
  it('lost create response automatically reads state but never repeats write', () => {
    const page = loaded(false).componentInstance;
    page.start();
    closed.next({ notes: null });
    http.expectOne('/api/shelves/3/inventory-sessions').error(new ProgressEvent('error'));
    expect(page.write.message()).toContain('Resultado incierto');
    get().flush(testInventoryHistory());
    http.expectNone((r) => r.method === 'POST');
  });
  it('pagination navigates applied page/size and links preserve current history position', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = loaded();
    fixture.componentInstance.paginate({ pageIndex: 2, pageSize: 20, length: 80 });
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { page: 2, size: 20 } }),
    );
    query.next(convertToParamMap({ page: '2', size: '20' }));
    const req = get();
    expect(req.request.params.get('page')).toBe('2');
    req.flush(testInventoryHistory({ page: 2 }));
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('a[href="/inventory-sessions/7?page=2&size=20"]'),
    ).toBeTruthy();
  });
  it('route change cancels GET, invalid id prevents HTTP, destruction closes dialogs', () => {
    const fixture = create();
    const req = get();
    params.next(convertToParamMap({ shelfId: 'bad' }));
    expect(req.cancelled).toBe(true);
    fixture.componentInstance.retry();
    http.expectNone(() => true);
    params.next(convertToParamMap({ shelfId: '3' }));
    get().flush(testInventoryHistory({ activeSession: null }));
    fixture.componentInstance.start();
    fixture.destroy();
    expect(close).toHaveBeenCalled();
  });
});
