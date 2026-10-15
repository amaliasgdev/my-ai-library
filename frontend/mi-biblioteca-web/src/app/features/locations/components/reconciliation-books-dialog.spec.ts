import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { ReconciliationBooksDialog } from './reconciliation-books-dialog';
import { testReconciliationDetail } from '../models/reconciliation.testing';

describe('ReconciliationBooksDialog', () => {
  let http: HttpTestingController;
  const close = vi.fn();
  beforeEach(() => {
    close.mockClear();
    TestBed.configureTestingModule({
      imports: [ReconciliationBooksDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: 'opaque-key' },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function create() {
    const fixture = TestBed.createComponent(ReconciliationBooksDialog);
    fixture.detectChanges();
    return fixture;
  }
  function request() {
    return http.expectOne((r) => r.url === '/api/locations/reconciliation/opaque-key');
  }
  it('loads only group detail, renders original variants and light book metadata, accepts explicit review', () => {
    const fixture = create();
    expect(fixture.nativeElement.textContent).toContain('Cargando libros');
    const detail = testReconciliationDetail();
    request().flush(detail);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Dune');
    expect(fixture.nativeElement.textContent).toContain('Frank Herbert');
    expect(fixture.nativeElement.textContent).toContain('9780306406157');
    expect(fixture.nativeElement.textContent).toContain('salón');
    expect(fixture.nativeElement.textContent).toContain('Revisión completa: 2 libros');
    fixture.componentInstance.accept();
    expect(close).toHaveBeenCalledWith(detail);
  });
  it('paginates lazily, keeps token opaque and detects changed full snapshot across pages', () => {
    const fixture = create();
    request().flush(testReconciliationDetail());
    fixture.detectChanges();
    fixture.componentInstance.paginate({ pageIndex: 1, pageSize: 10, length: 30 });
    const req = request();
    expect(req.request.params.get('page')).toBe('1');
    req.flush(testReconciliationDetail({ snapshotFingerprint: 'changed', page: 1 }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('El grupo cambió durante la revisión');
  });
  it('a newly issued token for unchanged snapshot is not a changed group', () => {
    const fixture = create();
    request().flush(testReconciliationDetail());
    fixture.componentInstance.paginate({ pageIndex: 1, pageSize: 10, length: 30 });
    request().flush(testReconciliationDetail({ reviewToken: 'new-token' }));
    expect(fixture.componentInstance.changed()).toBe(false);
  });
  it('error removes stale content, prevents accept and explicitly retries only GET; cancellation never writes', () => {
    const fixture = create();
    request().flush({}, { status: 404, statusText: 'Missing' });
    fixture.detectChanges();
    fixture.componentInstance.accept();
    expect(close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('No se pudo revisar');
    fixture.componentInstance.load();
    request().flush(testReconciliationDetail());
    fixture.componentInstance.close();
    expect(close).toHaveBeenCalledWith();
    http.expectNone((r) => r.method === 'POST');
  });
  it('destroy cancels the active GET', () => {
    const fixture = create();
    const req = request();
    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });
});
