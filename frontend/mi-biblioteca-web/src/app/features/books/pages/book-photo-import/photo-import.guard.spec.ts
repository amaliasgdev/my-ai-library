import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { testPhotoCapabilities } from '../../models/book-photo-import.testing';
import { BookPhotoImport } from './book-photo-import';
import { emptyPhotoDraft } from './photo-import-workflow';
import { photoImportCanDeactivate } from './photo-import.guard';

@Component({ template: 'Catálogo' })
class CatalogDestination {}

describe('Photo import navigation guard', () => {
  it('cancels navigation on refusal and returns to catalog only after explicit discard confirmation', async () => {
    let closed = new Subject<unknown>();
    const open = vi.fn(() => {
      closed = new Subject<unknown>();
      return { afterClosed: () => closed.asObservable(), close: () => closed.complete() };
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
        provideRouter([
          {
            path: 'books/photo-import',
            component: BookPhotoImport,
            canDeactivate: [photoImportCanDeactivate],
          },
          { path: 'books', component: CatalogDestination },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/books/photo-import', BookPhotoImport);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/book-photo-import/capabilities').flush(testPhotoCapabilities());
    page.workflow.source('manual', 'Manual', emptyPhotoDraft());
    page.workflow.review('manual');
    closed.next({
      title: 'Real book',
      author: 'Author',
      isbn: null,
      description: null,
      publisher: null,
      coverUrl: null,
      publicationYear: null,
      pageCount: null,
      language: null,
      genres: [],
    });
    closed.complete();
    http
      .expectOne((r) => r.url.endsWith('metadata-duplicates'))
      .flush({ matches: [], similarityChecked: true, truncated: false });
    const router = TestBed.inject(Router);
    const cancelled = router.navigateByUrl('/books');
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    closed.next(false);
    closed.complete();
    expect(await cancelled).toBe(false);
    expect(router.url).toBe('/books/photo-import');
    const accepted = router.navigateByUrl('/books');
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(3));
    closed.next(true);
    closed.complete();
    expect(await accepted).toBe(true);
    expect(router.url).toBe('/books');
    http.verify();
  });
});
