import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { InventorySessionDetail } from './inventory-session-detail';
import { testInventorySession } from '../../models/inventory.testing';

describe('InventorySessionDetail', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let closed: Subject<boolean>;
  const open = vi.fn();
  const close = vi.fn();
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    open.mockReset();
    close.mockReset();
    open.mockImplementation(() => {
      closed = new Subject();
      const result = closed;
      return { close, afterClosed: () => result.asObservable() };
    });
    TestBed.configureTestingModule({
      imports: [InventorySessionDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            snapshot: { queryParamMap: convertToParamMap({ page: '2', size: '50' }) },
          },
        },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function create() {
    const fixture = TestBed.createComponent(InventorySessionDetail);
    fixture.detectChanges();
    return fixture;
  }
  function get() {
    return http.expectOne('/api/inventory-sessions/7');
  }
  function loaded() {
    const fixture = create();
    get().flush(testInventorySession());
    fixture.detectChanges();
    return fixture;
  }
  it('loads context and notes, with explicit return route retaining page/size', () => {
    const fixture = loaded();
    expect(fixture.nativeElement.textContent).toContain('Salón > Billy > Superior');
    expect(fixture.componentInstance.notes.value).toBe('Notas originales');
    expect(
      fixture.nativeElement.querySelector(
        'a[href="/locations/shelves/3/inventory?page=2&size=50"]',
      ),
    ).toBeTruthy();
  });
  it.each(['COMPLETED', 'CANCELLED'] as const)(
    '%s is read-only and no invalid actions issue HTTP',
    (status) => {
      const fixture = create();
      get().flush(
        testInventorySession({
          status,
          completedAt: status === 'COMPLETED' ? '2026-10-15T09:00:00Z' : null,
          cancelledAt: status === 'CANCELLED' ? '2026-10-15T09:00:00Z' : null,
        }),
      );
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Solo lectura');
      fixture.componentInstance.save();
      fixture.componentInstance.closeSession('complete');
      http.expectNone(() => true);
      expect(open).not.toHaveBeenCalled();
    },
  );
  it('notes draft never autosaves; validates raw length and saves explicitly, synchronizing with GET', () => {
    const page = loaded().componentInstance;
    page.notes.setValue(' '.repeat(2001));
    page.save();
    http.expectNone(() => true);
    page.notes.setValue('  Updated\nnotes  ');
    page.notes.markAsDirty();
    http.expectNone(() => true);
    page.save();
    const req = http.expectOne('/api/inventory-sessions/7/notes');
    expect(req.request.body).toEqual({ notes: '  Updated\nnotes  ' });
    page.save();
    http.expectNone(() => true);
    req.flush(testInventorySession({ notes: 'Updated\nnotes' }));
    get().flush(testInventorySession({ notes: 'Updated\nnotes' }));
    expect(page.notes.value).toBe('Updated\nnotes');
    expect(page.notes.pristine).toBe(true);
  });
  it('dirty notes require explicit return-to-save or discard, never silently combine saving and closing', () => {
    const page = loaded().componentInstance;
    page.notes.setValue('Draft');
    page.notes.markAsDirty();
    page.closeSession('complete');
    expect(open).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ dirtyNotes: true }) }),
    );
    closed.next(false);
    expect(page.notes.value).toBe('Draft');
    http.expectNone(() => true);
    page.closeSession('complete');
    closed.next(true);
    expect(page.notes.value).toBe('Notas originales');
    expect(open).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ dirtyNotes: false }) }),
    );
    closed.next(false);
    http.expectNone(() => true);
  });
  it.each(['complete', 'cancel'] as const)(
    '%s confirms once, blocks notes and double click, reload failure repeats only GET',
    (action) => {
      const page = loaded().componentInstance;
      page.closeSession(action);
      page.closeSession(action);
      expect(open).toHaveBeenCalledTimes(1);
      closed.next(true);
      const req = http.expectOne(`/api/inventory-sessions/7/${action}`);
      page.save();
      page.closeSession(action);
      http.expectNone(() => true);
      req.flush(testInventorySession({ status: 'COMPLETED' }));
      get().flush({}, { status: 500, statusText: 'Error' });
      page.closeSession(action);
      http.expectNone(() => true);
      page.retry();
      get().flush(testInventorySession({ status: 'COMPLETED' }));
      http.expectNone((r) => r.method === 'POST');
    },
  );
  it('uncertain notes write reads actual state without repeating PUT and retains active user draft', () => {
    const page = loaded().componentInstance;
    page.notes.setValue('Draft');
    page.notes.markAsDirty();
    page.save();
    http.expectOne('/api/inventory-sessions/7/notes').error(new ProgressEvent('error'));
    expect(page.write.message()).toContain('Resultado incierto');
    get().flush(testInventorySession());
    expect(page.notes.value).toBe('Draft');
    http.expectNone((r) => r.method === 'PUT');
  });
  it('409 close synchronizes terminal state without repeating action', () => {
    const page = loaded().componentInstance;
    page.closeSession('cancel');
    closed.next(true);
    http
      .expectOne('/api/inventory-sessions/7/cancel')
      .flush(
        { code: 'INVENTORY_SESSION_INVALID_TRANSITION' },
        { status: 409, statusText: 'Conflict' },
      );
    get().flush(testInventorySession({ status: 'COMPLETED' }));
    expect(page.session()?.status).toBe('COMPLETED');
    page.closeSession('cancel');
    http.expectNone(() => true);
  });
  it('GET failure supports explicit retry; invalid id cancels previous GET and cannot request', () => {
    const fixture = create();
    get().flush({}, { status: 404, statusText: 'Missing' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar');
    fixture.componentInstance.retry();
    const req = get();
    params.next(convertToParamMap({ id: 'bad' }));
    expect(req.cancelled).toBe(true);
    fixture.componentInstance.retry();
    http.expectNone(() => true);
  });
  it('route changes cancel pending write and reject late dialogs or content', () => {
    const fixture = loaded();
    const page = fixture.componentInstance;
    page.closeSession('complete');
    params.next(convertToParamMap({ id: '8' }));
    closed.next(true);
    http.expectNone((r) => r.method === 'POST');
    http.expectOne('/api/inventory-sessions/8').flush(testInventorySession({ id: 8 }));
    expect(page.session()?.id).toBe(8);
    page.save();
    const req = http.expectOne('/api/inventory-sessions/8/notes');
    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });
});
