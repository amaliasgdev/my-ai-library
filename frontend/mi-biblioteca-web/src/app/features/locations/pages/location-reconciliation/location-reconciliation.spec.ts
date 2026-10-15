import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { LocationReconciliation } from './location-reconciliation';
import { ReconciliationBooksDialog } from '../../components/reconciliation-books-dialog';
import { ReconciliationConfirmDialog } from '../../components/reconciliation-confirm-dialog';
import {
  testReconciliationDetail,
  testReconciliationGroup,
  testReconciliationPage,
} from '../../models/reconciliation.testing';
import { testLocations } from '../../models/location.testing';
import { routes } from '../../../../app.routes';

describe('LocationReconciliation page', () => {
  let http: HttpTestingController;
  let closed: Subject<unknown>;
  const close = vi.fn();
  const open = vi.fn();
  beforeEach(() => {
    closed = new Subject();
    open.mockReset();
    close.mockReset();
    open.mockImplementation(() => {
      closed = new Subject();
      const result = closed;
      return {
        close,
        afterClosed: () => result.asObservable(),
      } as unknown as MatDialogRef<unknown>;
    });
    TestBed.configureTestingModule({
      imports: [LocationReconciliation],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function create() {
    const fixture = TestBed.createComponent(LocationReconciliation);
    fixture.detectChanges();
    return fixture;
  }
  function list() {
    return http.expectOne((r) => r.url === '/api/locations/reconciliation');
  }
  function loaded() {
    const fixture = create();
    list().flush(testReconciliationPage());
    fixture.detectChanges();
    return fixture;
  }
  function ready() {
    const fixture = loaded();
    const page = fixture.componentInstance;
    const group = testReconciliationGroup();
    page.choose(group);
    page.loadLocations();
    http.expectOne('/api/locations').flush(testLocations());
    page.select({ shelfId: 3, incomplete: false, clearLegacy: true });
    page.books(group);
    closed.next(testReconciliationDetail());
    fixture.detectChanges();
    return { fixture, page, group };
  }
  function post() {
    return http.expectOne('/api/locations/reconciliation/assign');
  }
  it('has a lazy independent route', () => {
    const route = routes.find((r) => r.path === 'locations/reconcile');
    expect(route?.loadComponent).toBeTypeOf('function');
  });
  it('shows loading, global/session stats, a native Material table and unselected suggestion', () => {
    const fixture = create();
    expect(fixture.nativeElement.textContent).toContain('Cargando grupos pendientes');
    list().flush(testReconciliationPage());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table[mat-table]')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('th')).toHaveLength(8);
    expect(fixture.nativeElement.querySelectorAll('.mobile-label')).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('Coincidencia exacta sugerida');
    expect(fixture.componentInstance.shelfId()).toBeNull();
    expect(fixture.componentInstance.destination()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Grupos pendientes');
    expect(fixture.componentInstance.sessionBooks()).toBe(0);
  });
  it('handles empty and error with explicit retry of GET', () => {
    const fixture = create();
    list().flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron actualizar');
    fixture.componentInstance.load();
    list().flush(testReconciliationPage({ content: [] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay grupos pendientes');
  });
  it('draft keystrokes never GET; Apply/Clear and pagination use applied criteria', () => {
    const page = loaded().componentInstance;
    page.filters.setValue({ type: 'PARTIAL', text: ' Dormitorio ' });
    http.expectNone(() => true);
    page.apply();
    const applied = list();
    expect(applied.request.params.get('type')).toBe('PARTIAL');
    expect(applied.request.params.get('text')).toBe('Dormitorio');
    applied.flush(testReconciliationPage());
    page.filters.controls.text.setValue('Not applied');
    page.paginate({ pageIndex: 2, pageSize: 20, length: 60 });
    const paged = list();
    expect(paged.request.params.get('page')).toBe('2');
    expect(paged.request.params.get('text')).toBe('Dormitorio');
    paged.flush(testReconciliationPage());
    page.clear();
    const cleared = list();
    expect(cleared.request.params.get('type')).toBe('ALL');
    expect(cleared.request.params.has('text')).toBe(false);
    cleared.flush(testReconciliationPage());
  });
  it('invalid filter blocks requests, and changing size resets page', () => {
    const page = loaded().componentInstance;
    page.filters.controls.text.setValue('x'.repeat(256));
    page.apply();
    http.expectNone(() => true);
    page.paginate({ pageIndex: 3, pageSize: 50, length: 200 });
    const req = list();
    expect(req.request.params.get('page')).toBe('0');
    req.flush(testReconciliationPage());
  });
  it('partial groups warn against invented identity, can remain pending, and selection incomplete blocks conversion', () => {
    const fixture = loaded();
    const page = fixture.componentInstance;
    const group = testReconciliationGroup({
      type: 'PARTIAL',
      room: null,
      bookcase: null,
      match: 'NOT_APPLICABLE',
      destinationSuggestion: null,
    });
    page.choose(group);
    page.select({ shelfId: null, incomplete: true, clearLegacy: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Estos libros comparten una ubicación incompleta',
    );
    page.reconcile(group);
    expect(open).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });
  it('suggestion is selected only explicitly and requires existing hierarchy, review and confirmation', () => {
    const page = loaded().componentInstance;
    const group = testReconciliationGroup();
    page.reconcile(group);
    expect(open).not.toHaveBeenCalled();
    page.useSuggestion(group);
    expect(page.shelfId()).toBe(3);
    http.expectOne('/api/locations').flush(testLocations());
    expect(page.destination()?.shelfName).toBe('Superior');
    page.reconcile(group);
    expect(open).not.toHaveBeenCalled();
  });
  it('uses existing explicit hierarchy creation and reload on successful dialog; cancel saves no Book', () => {
    const page = loaded().componentInstance;
    page.choose(testReconciliationGroup());
    page.createLocation({ level: 'rooms' });
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ level: 'rooms' }) }),
    );
    closed.next({ id: 10, name: 'Room' });
    http.expectOne('/api/locations').flush(testLocations());
    http.expectNone((r) => r.method === 'POST');
  });
  it('books opens group-specific dialog lazily, never catalog effective-name filters; cancel never writes', () => {
    const page = loaded().componentInstance;
    page.books(testReconciliationGroup());
    expect(open).toHaveBeenCalledWith(
      ReconciliationBooksDialog,
      expect.objectContaining({ data: 'opaque-key' }),
    );
    closed.next(undefined);
    expect(page.review()).toBeNull();
    http.expectNone(() => true);
  });
  it('confirmation displays reviewed count/variants and explicit destination; cancel has no POST', () => {
    const { page, group } = ready();
    page.reconcile(group);
    expect(open).toHaveBeenLastCalledWith(
      ReconciliationConfirmDialog,
      expect.objectContaining({
        data: expect.objectContaining({
          detail: expect.objectContaining({ reviewedCount: 2, variants: expect.any(Array) }),
          destination: expect.objectContaining({ shelfId: 3 }),
        }),
      }),
    );
    closed.next(false);
    http.expectNone((r) => r.method === 'POST');
    expect(page.sessionGroups()).toBe(0);
  });
  it('one POST at a time blocks duplicate dialogs/writes and destination changes; success refreshes with confirmed session stats', () => {
    const { page, group } = ready();
    page.reconcile(group);
    page.reconcile(group);
    expect(open).toHaveBeenCalledTimes(2);
    closed.next(true);
    const req = post();
    expect(req.request.body).toEqual({
      reviewToken: 'opaque.signed',
      shelfId: 3,
      expectedDestination: { room: 'Salón', bookcase: 'Billy izquierda', shelf: 'Superior' },
    });
    page.select({ shelfId: 4, incomplete: false, clearLegacy: true });
    page.reconcile(group);
    page.apply();
    page.clear();
    page.loadLocations();
    page.createLocation({ level: 'rooms' });
    expect(page.shelfId()).toBe(3);
    http.expectNone(() => true);
    req.flush({ affectedCount: 2, shelfId: 3 });
    expect(page.sessionGroups()).toBe(1);
    expect(page.sessionBooks()).toBe(2);
    list().flush(testReconciliationPage({ content: [] }));
  });
  it('successful POST followed by GET failure retries only GET, never counts or POST twice', () => {
    const { page, group } = ready();
    page.reconcile(group);
    closed.next(true);
    post().flush({ affectedCount: 2, shelfId: 3 });
    list().flush({}, { status: 500, statusText: 'Error' });
    expect(page.sessionGroups()).toBe(1);
    page.load();
    list().flush(testReconciliationPage({ content: [] }));
    expect(page.sessionBooks()).toBe(2);
    http.expectNone((r) => r.method === 'POST');
  });
  it.each(['RECONCILIATION_STALE', 'RECONCILIATION_EXPIRED', 'RECONCILIATION_DESTINATION_CHANGED'])(
    '409 %s clears review and requires explicit refresh/reconfirmation',
    (code) => {
      const { page, group } = ready();
      page.reconcile(group);
      closed.next(true);
      post().flush({ code, detail: 'unsafe SQL' }, { status: 409, statusText: 'Conflict' });
      expect(page.review()).toBeNull();
      expect(page.writeMessage()).not.toContain('SQL');
      expect(page.sessionGroups()).toBe(0);
      page.reconcile(group);
      http.expectNone(() => true);
    },
  );
  it('network loss is uncertain, never automatically repeats and never increments session stats', () => {
    const { page, group } = ready();
    page.reconcile(group);
    closed.next(true);
    post().error(new ProgressEvent('error'));
    expect(page.writeMessage()).toContain('Resultado incierto');
    expect(page.sessionGroups()).toBe(0);
    page.reconcile(group);
    http.expectNone(() => true);
    page.load();
    list().flush(testReconciliationPage({ content: [] }));
    expect(page.sessionGroups()).toBe(0);
  });
  it('client expiry prevents POST until new review and does not silently renew it', () => {
    const { page, group } = ready();
    page.review.set(testReconciliationDetail({ expiresAt: '2000-01-01T00:00:00Z' }));
    page.reconcile(group);
    expect(page.writeMessage()).toContain('caducado');
    http.expectNone(() => true);
  });
  it('destroy cancels the GET and closes owned dialogs', () => {
    const fixture = create();
    const req = list();
    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });
});
