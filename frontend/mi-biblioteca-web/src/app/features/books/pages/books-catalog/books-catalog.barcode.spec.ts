import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { IsbnScanDialog } from '../../components/isbn-scan-dialog/isbn-scan-dialog';
import { testBookPage } from '../../models/book.testing';
import { BooksCatalog } from './books-catalog';
import { provideCatalogRoutingTesting } from './books-catalog-routing.testing';

describe('Catalog scan-to-create action', () => {
  let fixture: ComponentFixture<BooksCatalog>;
  let result: Subject<string | undefined>;
  let open: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let close: ReturnType<typeof vi.fn>;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BooksCatalog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideCatalogRoutingTesting(),
      ],
    });
    fixture = TestBed.createComponent(BooksCatalog);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    result = new Subject();
    close = vi.fn();
    const ref = { afterClosed: () => result.asObservable(), close } as unknown as MatDialogRef<
      IsbnScanDialog,
      string
    >;
    open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue(ref);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/books?page=0&size=20&sortBy=title&direction=ASC').flush(testBookPage());
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });
  function button(): HTMLButtonElement {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Escanear ISBN',
    )!;
  }
  it('exposes an accessible Material button outside search with an add-book explanation', () => {
    const action = button();
    expect(action).toBeDefined();
    expect(action.type).toBe('button');
    expect(action.closest('form')).toBeNull();
    expect(action.hasAttribute('mat-button')).toBe(true);
    expect(action.getAttribute('aria-describedby')).toBe('catalog-scan-help');
    expect(fixture.nativeElement.querySelector('#catalog-scan-help').textContent).toBe(
      'Escanea para añadir un libro',
    );
  });
  it('opens the existing scanner only once for two clicks', () => {
    button().click();
    button().click();
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      IsbnScanDialog,
      expect.objectContaining({ restoreFocus: true }),
    );
    http.expectNone((request) => request.url.includes('isbn-lookup'));
  });
  it('cancel/Escape/backdrop result does not navigate and allows reopening', () => {
    button().click();
    result.next(undefined);
    expect(navigate).not.toHaveBeenCalled();
    button().click();
    expect(open).toHaveBeenCalledTimes(2);
  });
  it('valid result navigates with only isbn, never catalog search/page context', () => {
    fixture.componentInstance.searchForm.controls.title.setValue('Draft search');
    button().click();
    result.next('9780306406157');
    result.next('9780306406157');
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/books/new'], {
      queryParams: { isbn: '9780306406157' },
    });
    http.expectNone((request) => request.url.includes('isbn-lookup') || request.method === 'POST');
  });
  it.each(['4006381333931', '9780306406158', ' 9780306406157', '978-0306406157', ''])(
    'ignores invalid result without repair: %s',
    (isbn) => {
      button().click();
      result.next(isbn);
      expect(navigate).not.toHaveBeenCalled();
    },
  );
  it('destroy closes the dialog and rejects any late result or opening', () => {
    button().click();
    fixture.destroy();
    expect(close).toHaveBeenCalledOnce();
    result.next('9780306406157');
    fixture.componentInstance.openScanner();
    expect(navigate).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
  });
});
