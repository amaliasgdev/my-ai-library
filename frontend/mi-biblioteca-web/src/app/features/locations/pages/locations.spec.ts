import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Locations } from './locations';
import { testLocations } from '../models/location.testing';

describe('Locations page', () => {
  it('offers inventory links without per-shelf HTTP and explains inventory deletion blocks', () => {
    const fixture = create();
    const rooms = testLocations();
    rooms[0].bookcases[0].shelves[0].canDelete = false;
    rooms[0].bookcases[0].shelves[0].blockedReason = 'INVENTORY_SESSIONS';
    http.expectOne('/api/locations').flush(rooms);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('a[href="/locations/shelves/3/inventory"]')?.textContent,
    ).toContain('Inventario');
    expect(fixture.nativeElement.textContent).toContain('Tiene historial de inventario');
    http.expectNone((request) => request.url.includes('inventory-sessions'));
  });
  it('links to the independent reconciliation page without changing catalog filters', () => {
    const fixture = create();
    http.expectOne('/api/locations').flush([]);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      'a[href="/locations/reconcile"]',
    ) as HTMLAnchorElement;
    expect(link.textContent).toContain('Conciliar ubicaciones anteriores');
  });
  let http: HttpTestingController;
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [Locations],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    }),
  );
  afterEach(() => http.verify());
  function create() {
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Locations);
    fixture.detectChanges();
    return fixture;
  }
  it('shows loading, empty, safe error and retry; does not show stale hierarchy', () => {
    const fixture = create();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Cargando ubicaciones');
    http.expectOne('/api/locations').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay ubicaciones estructuradas');
    page.load();
    http.expectOne('/api/locations').flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
    page.load();
    http.expectOne('/api/locations').flush(testLocations());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('mat-expansion-panel')).toHaveLength(4);
    expect(fixture.nativeElement.textContent).toContain('Salón — 2 libros');
    const shelfLinks = Array.from(
      fixture.nativeElement.querySelectorAll('a'),
    ) as HTMLAnchorElement[];
    expect(shelfLinks.some((a) => a.getAttribute('href') === '/books?shelfId=3')).toBe(true);
  });
  it('explicit creation/rename dialogs refresh only after confirmed save, cancel does nothing', async () => {
    const fixture = create();
    const page = fixture.componentInstance;
    http.expectOne('/api/locations').flush(testLocations());
    page.edit('rooms');
    const dialog = TestBed.inject(MatDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    page.edit('rooms');
    expect(dialog.openDialogs).toHaveLength(1);
    dialog.openDialogs[0].close();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    http.expectNone(() => true);
    page.edit('bookcases', { id: 2, name: 'Billy' });
    dialog.openDialogs[0].close({ id: 2, name: 'Renamed' });
    await vi.waitFor(() => expect(page.loading()).toBe(true));
    http.expectOne('/api/locations').flush(testLocations());
  });
  it('blocks deletion in use, writes only after confirmation, keeps 409 safe and can reload', async () => {
    const fixture = create();
    const page = fixture.componentInstance;
    http.expectOne('/api/locations').flush(testLocations());
    page.remove('shelves', testLocations()[0].bookcases[0].shelves[0]);
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
    page.remove('shelves', testLocations()[0].bookcases[0].shelves[1]);
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(page.pending()).toBe(true));
    const req = http.expectOne('/api/shelves/4');
    expect(req.request.method).toBe('DELETE');
    req.flush({ detail: 'SQL' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('La ubicación está en uso');
    expect(fixture.nativeElement.textContent).not.toContain('SQL');
    page.load();
    http.expectOne('/api/locations').flush(testLocations());
  });
  it('successful deletion reloads hierarchy once and never locally decrements counts', async () => {
    const fixture = create();
    const page = fixture.componentInstance;
    http.expectOne('/api/locations').flush(testLocations());
    page.remove('shelves', testLocations()[0].bookcases[0].shelves[1]);
    TestBed.inject(MatDialog).openDialogs[0].close(true);
    await vi.waitFor(() => expect(page.pending()).toBe(true));
    http.expectOne('/api/shelves/4').flush(null);
    http.expectOne('/api/locations').flush(testLocations());
  });
});
