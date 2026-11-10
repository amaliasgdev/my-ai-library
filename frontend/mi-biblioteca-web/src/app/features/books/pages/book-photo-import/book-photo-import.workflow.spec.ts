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
  it('associates the final candidate with the photo, reviews real data, confirms import and links its confirmed ID', async () => {
    const { fixture, http, flow, dialogs } = await create();
    expect(flow.rows()).toHaveLength(1);
    expect(flow.rows()[0].source).toBe('real-photo.jpg');
    expect(flow.rows()[0].selected).toBe(false);
    const candidate = fixture.debugElement.query(By.directive(PhotoMetadataCandidate))
      .componentInstance as PhotoMetadataCandidate;
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
