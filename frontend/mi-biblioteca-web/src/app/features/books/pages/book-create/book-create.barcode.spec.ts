import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BookForm } from '../../components/book-form/book-form';
import { IsbnBarcodeReader } from '../../components/isbn-scan-dialog/isbn-barcode-reader';
import { IsbnScanDialog } from '../../components/isbn-scan-dialog/isbn-scan-dialog';
import { testBookLookup } from '../../models/book.testing';
import { BookCreate } from './book-create';

describe('BookCreate local barcode to existing lookup', () => {
  let fixture: ComponentFixture<BookCreate>;
  let page: BookCreate;
  let editor: BookForm;
  let http: HttpTestingController;
  const isbn = '9780306406157';
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookCreate],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: {
            ...new MatDialogConfig(),
            enterAnimationDuration: 0,
            exitAnimationDuration: 0,
          },
        },
      ],
    });
    TestBed.overrideComponent(IsbnScanDialog, {
      set: {
        providers: [
          {
            provide: IsbnBarcodeReader,
            useValue: { startCamera: vi.fn().mockResolvedValue(undefined), cleanup: vi.fn() },
          },
        ],
      },
    });
    fixture = TestBed.createComponent(BookCreate);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    page = fixture.componentInstance;
    editor = page.editor();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.inject(MatDialog).closeAll();
    http.verify();
  });
  async function scan(value: string | null = isbn) {
    page.openScanner();
    await fixture.whenStable();
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    const closed = firstValueFrom(ref.afterClosed());
    ref.close(value ?? undefined);
    await closed;
    await fixture.whenStable();
  }
  function lookup() {
    return http.expectOne((request) => request.url === '/api/books/isbn-lookup');
  }

  it('exposes scanner only through enabled optional BookForm output', async () => {
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.trim() === 'Escanear ISBN')!;
    expect(button.type).toBe('button');
    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
    http.expectNone((request) => request.method === 'GET');
    page.openScanner();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });
  it('cancel leaves ISBN and form pristine/touched state unchanged, without lookup', async () => {
    editor.form.controls.isbn.setValue('1234567890');
    const before = editor.form.getRawValue();
    await scan(null);
    expect(editor.form.getRawValue()).toEqual(before);
    expect(editor.form.controls.isbn.pristine).toBe(true);
    expect(editor.form.controls.isbn.untouched).toBe(true);
    http.expectNone((request) => request.method === 'GET');
  });
  it.each([false, true])(
    'valid scan marks dirty and retains touched=%s, making exactly one lookup',
    async (touched) => {
      if (touched) editor.form.controls.isbn.markAsTouched();
      await scan();
      expect(editor.form.controls.isbn.value).toBe(isbn);
      expect(editor.form.controls.isbn.dirty).toBe(true);
      expect(editor.form.controls.isbn.touched).toBe(touched);
      expect(page.detectedIsbn()).toBe(isbn);
      expect(fixture.nativeElement.textContent).toContain(`ISBN detectado: ${isbn}`);
      const request = lookup();
      expect(request.request.params.get('isbn')).toBe(isbn);
      http.expectNone((request) => request.method === 'GET');
      request.flush(testBookLookup({ isbn }));
    },
  );
  it('does not trust an invalid dialog result', async () => {
    await scan('4006381333931');
    expect(editor.form.controls.isbn.value).toBe('');
    http.expectNone((request) => request.method === 'GET');
  });
  it('opening scanner cancels previous lookup; cancel does not resume it', async () => {
    editor.form.controls.isbn.setValue(isbn);
    page.lookup(isbn);
    const old = lookup();
    page.openScanner();
    expect(old.cancelled).toBe(true);
    TestBed.inject(MatDialog).openDialogs[0].close();
    await fixture.whenStable();
    expect(editor.form.controls.isbn.value).toBe(isbn);
    http.expectNone((request) => request.method === 'GET');
  });
  it('cancels old lookup even when detected ISBN is the same', async () => {
    editor.form.controls.isbn.setValue(isbn);
    page.lookup(isbn);
    const old = lookup();
    await scan();
    expect(old.cancelled).toBe(true);
    lookup().flush(testBookLookup({ isbn }));
  });
  it('lookup error keeps detected ISBN and manual changes clear its message', async () => {
    await scan();
    lookup().flush({}, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(page.detectedIsbn()).toBe(isbn);
    expect(editor.form.controls.isbn.value).toBe(isbn);
    expect(fixture.nativeElement.textContent).toContain(`ISBN detectado: ${isbn}`);
    editor.form.controls.isbn.setValue('9780132350884');
    expect(page.detectedIsbn()).toBeNull();
  });
  it('uses existing partial application preserving drafts, description, genres and cover', async () => {
    editor.form.patchValue({
      description: 'Exact description',
      coverUrl: 'https://example.test/cover.jpg',
    });
    editor.genreInput.setValue('Pending');
    await scan();
    const request = lookup();
    editor.form.controls.title.setValue('Typed during GET');
    request.flush(testBookLookup({ isbn }));
    expect(editor.form.controls.title.value).toBe('Typed during GET');
    expect(editor.form.controls.author.value).toBe('Robert C. Martin');
    expect(editor.form.controls.description.value).toBe('Exact description');
    expect(editor.form.controls.coverUrl.value).toBe('https://example.test/cover.jpg');
    expect(editor.form.controls.genres.value).toEqual([]);
    expect(editor.genreInput.value).toBe('Pending');
  });
  it('manual edits cancel lookup and stale proposals cannot apply', async () => {
    await scan();
    const request = lookup();
    editor.form.controls.isbn.setValue('1234567890');
    expect(request.cancelled).toBe(true);
    expect(editor.form.controls.title.value).toBe('');
    expect(page.detectedIsbn()).toBeNull();
  });
  it('destroy closes scanner and prevents late results or lookup', () => {
    page.openScanner();
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    fixture.destroy();
    ref.close(isbn);
    http.expectNone((request) => request.method === 'GET');
  });
  it('disables scanner while creating and cancels scanner on Cancelar', async () => {
    page.submitting.set(true);
    page.openScanner();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
    page.submitting.set(false);
    page.openScanner();
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    const close = vi.spyOn(ref, 'close');
    page.cancel();
    expect(close).toHaveBeenCalled();
  });
});
