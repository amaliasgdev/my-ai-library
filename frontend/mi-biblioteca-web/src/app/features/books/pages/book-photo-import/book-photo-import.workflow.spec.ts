import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { PhotoMetadataCandidate } from '../../components/photo-metadata-candidate/photo-metadata-candidate';
import { PhotoImportReviewDialog } from '../../components/photo-import-review-dialog/photo-import-review-dialog';
import { PhotoImportConfirmDialog } from '../../components/photo-import-confirm-dialog/photo-import-confirm-dialog';
import { testPhotoCapabilities, testPhotoResult } from '../../models/book-photo-import.testing';
import { BookPhotoImport } from './book-photo-import';
import { PhotoImportWorkflow } from './photo-import-workflow';

describe('BookPhotoImport final review integration', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  async function create() {
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => 'blob:photo'),
        revokeObjectURL: vi.fn(),
      }),
    );
    TestBed.configureTestingModule({
      imports: [BookPhotoImport],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(BookPhotoImport);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/book-photo-import/capabilities').flush(
      testPhotoCapabilities({
        enabled: true,
        mode: 'SIMULATED',
        simulated: true,
        provider: 'mock',
      }),
    );
    const input = fixture.nativeElement.querySelector('input[multiple]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['image'], 'real-photo.jpg', { type: 'image/jpeg' })],
    });
    input.dispatchEvent(new Event('change'));
    fixture.componentInstance.analyze();
    http.expectOne('/api/book-photo-import/recognize').flush(testPhotoResult());
    fixture.detectChanges();
    await fixture.whenStable();
    return {
      fixture,
      http,
      page: fixture.componentInstance,
      flow: fixture.debugElement.injector.get(PhotoImportWorkflow),
      dialogs: TestBed.inject(MatDialog),
    };
  }
  it('reviews and confirms import, preserves wizard state and explicitly appends the confirmed Book to the reading list', async () => {
    const { fixture, http, flow, dialogs, page } = await create();
    expect(flow.rows()).toHaveLength(1);
    expect(flow.rows()[0].source).toBe('real-photo.jpg');
    expect(flow.rows()[0].selected).toBe(false);
    const candidate = fixture.debugElement.query(By.directive(PhotoMetadataCandidate))
      .componentInstance as PhotoMetadataCandidate;
    page.openCandidate(flow.rows()[0].id);
    candidate.requestReview();
    fixture.detectChanges();
    await fixture.whenStable();
    const review = dialogs.openDialogs[0].componentInstance as PhotoImportReviewDialog;
    expect(review.realConfirmed()).toBe(false);
    review.realConfirmed.set(true);
    review.confirm({
      title: 'Actual photographed book',
      author: 'Actual author',
      isbn: null,
      description: null,
      coverUrl: null,
      publisher: null,
      publicationYear: null,
      pageCount: null,
      language: null,
      genres: [],
    });
    await fixture.whenStable();
    const noDuplicates = {
      matches: [],
      similarityChecked: true,
      truncated: false,
      validIsbn: false,
      equivalentIsbns: [],
      originalIsbn: null,
      normalizedIsbn: null,
    };
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('metadata-duplicates')))).flush(
      noDuplicates,
    );
    flow.selectAll(true);
    flow.importSelected();
    fixture.detectChanges();
    await fixture.whenStable();
    const confirm = dialogs.openDialogs[0];
    expect(confirm.componentInstance).toBeInstanceOf(PhotoImportConfirmDialog);
    confirm.close(true);
    await fixture.whenStable();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('metadata-duplicates')))).flush(
      noDuplicates,
    );
    const post = http.expectOne('/api/books');
    expect(post.request.body.title).toBe('Actual photographed book');
    expect(post.request.body.coverUrl).toBeNull();
    post.flush({ id: 987 });
    fixture.detectChanges();
    expect(flow.rows()[0].bookId).toBe(987);
    expect(fixture.nativeElement.textContent).toContain('Importados: 1');
    expect(fixture.nativeElement.querySelector('a[href="/books/987"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('simulado');
    http.expectNone((r) => r.url.includes('reading-list'));
    await fixture.whenStable();
    page.goToStep(3);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Añadir a mi lista de lectura');
    expect(page.reading.selectedCount()).toBe(0);
    page.reading.refresh();
    http
      .expectOne((r) => r.url.endsWith('/reading-list/membership'))
      .flush({
        revision: '10',
        items: [{ bookId: 987, included: false, entryId: null }],
      });
    page.reading.select(987, true);
    page.goToStep(1);
    fixture.detectChanges();
    page.goToStep(3);
    fixture.detectChanges();
    expect(page.reading.selectedCount()).toBe(1);
    http.expectNone((r) => r.method === 'POST');
    page.reading.addSelected();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialogs.openDialogs).toHaveLength(1);
    http.expectNone('/api/reading-list');
    dialogs.openDialogs[0].close(true);
    await fixture.whenStable();
    (await vi.waitFor(() => http.expectOne('/api/reading-list'))).flush({
      revision: '10',
      totalItems: 0,
      items: [],
    });
    const append = http.expectOne('/api/reading-list/items');
    expect(append.request.body).toEqual({ bookId: 987, expectedRevision: '10' });
    page.goToStep(0);
    fixture.detectChanges();
    page.goToStep(3);
    fixture.detectChanges();
    expect(append.cancelled).toBe(false);
    append.flush({ revision: '11', item: { entryId: 12, position: 0, book: { id: 987 } } });
    fixture.detectChanges();
    expect(page.reading.summary().added).toBe(1);
    expect(flow.rows()[0].bookId).toBe(987);
    expect(fixture.nativeElement.querySelector('a[href="/reading-list"]')).not.toBeNull();
    http.expectNone((r) => r.method === 'POST');
    http.verify();
  });
  it('reopens final review with confirmed corrections instead of older visual proposals and renews confirmation', async () => {
    const { fixture, http, flow, dialogs, page } = await create();
    const candidate = fixture.debugElement.query(By.directive(PhotoMetadataCandidate))
      .componentInstance as PhotoMetadataCandidate;
    candidate.requestReview();
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = dialogs.openDialogs[0].componentInstance as PhotoImportReviewDialog;
    dialog.realConfirmed.set(true);
    dialog.confirm({
      title: 'Título corregido',
      author: 'Autor corregido',
      isbn: null,
      description: 'Corrección manual',
      coverUrl: null,
      publisher: 'Editorial corregida',
      publicationYear: null,
      pageCount: null,
      language: null,
      genres: [],
    });
    await fixture.whenStable();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/metadata-duplicates')))).flush({
      matches: [],
      truncated: false,
      similarityChecked: true,
    });
    flow.selectAll(true);
    for (const step of [0, 1, 3, 2]) {
      page.goToStep(step);
      fixture.detectChanges();
    }
    expect(flow.selectedCount()).toBe(1);
    candidate.requestReview();
    fixture.detectChanges();
    await fixture.whenStable();
    const reopened = dialogs.openDialogs[0].componentInstance as PhotoImportReviewDialog;
    expect(reopened.data.title).toBe('Título corregido');
    expect(reopened.data.description).toBe('Corrección manual');
    expect(reopened.data.publisher).toBe('Editorial corregida');
    expect(reopened.realConfirmed()).toBe(false);
    expect(flow.selectedCount()).toBe(0);
    dialogs.openDialogs[0].close();
    await fixture.whenStable();
    http.expectNone((r) => r.method === 'POST');
    http.verify();
  });
  it('warns on browser unload only after review, blocks batch mutation during writes and retains history when removing photos', async () => {
    const { fixture, http, flow, page, dialogs } = await create();
    const untouched = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(untouched);
    expect(untouched.defaultPrevented).toBe(false);
    flow.review(flow.rows()[0].id);
    fixture.detectChanges();
    await fixture.whenStable();
    const review = dialogs.openDialogs[0].componentInstance as PhotoImportReviewDialog;
    review.realConfirmed.set(true);
    review.confirm({
      title: 'Real title',
      author: 'Author',
      isbn: null,
      description: null,
      coverUrl: null,
      publisher: null,
      publicationYear: null,
      pageCount: null,
      language: null,
      genres: [],
    });
    await fixture.whenStable();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('metadata-duplicates')))).flush({
      matches: [],
      similarityChecked: true,
      truncated: false,
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const id = page.photos()[0].id;
    page.removePhoto(id);
    expect(page.photos()).toHaveLength(0);
    expect(flow.rows()[0].draft.title).toBe('Real title');
    http.verify();
  });
});
