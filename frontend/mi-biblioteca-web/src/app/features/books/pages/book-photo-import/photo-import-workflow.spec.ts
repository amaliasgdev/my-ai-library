import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Observable } from 'rxjs';
import { BookRequest } from '../../models/book.models';
import { MetadataDuplicates } from '../../models/book-metadata.models';
import { PhotoImportWorkflow, MANUAL_SOURCE, emptyPhotoDraft } from './photo-import-workflow';
import { ManualCandidateDialog } from '../../components/manual-candidate-dialog/manual-candidate-dialog';
import { PhotoReadingListWorkflow } from './photo-reading-list-workflow';

describe('PhotoImportWorkflow (offline, no backend writes)', () => {
  let flow: PhotoImportWorkflow;
  let http: HttpTestingController;
  let closed: Subject<unknown>;
  const open = vi.fn();
  const dup = (request: { url: string }) => request.url.endsWith('/metadata-duplicates');
  const exact = (request: { url: string }) => request.url.endsWith('/books/search');
  const posts = (request: { method: string }) => request.method === 'POST';
  const request: BookRequest = {
    title: 'Real book',
    author: 'Real author',
    isbn: null,
    description: 'User description',
    coverUrl: 'https://example.org/cover.jpg',
    publisher: null,
    publicationYear: null,
    pageCount: null,
    language: null,
    genres: [],
  };
  const clear: MetadataDuplicates = {
    originalIsbn: null,
    normalizedIsbn: null,
    validIsbn: false,
    equivalentIsbns: [],
    matches: [],
    truncated: false,
    similarityChecked: true,
  };
  const possible: MetadataDuplicates = {
    ...clear,
    matches: [
      {
        id: 5,
        title: 'Real book',
        author: 'Real author',
        isbn: null,
        kind: 'POSSIBLE_TITLE_AUTHOR',
      },
    ],
  };
  beforeEach(() => {
    open.mockReset();
    open.mockImplementation(() => {
      closed = new Subject<unknown>();
      return {
        afterClosed: () => closed.asObservable(),
        close: () => {
          closed.complete();
        },
      };
    });
    TestBed.configureTestingModule({
      providers: [
        PhotoImportWorkflow,
        PhotoReadingListWorkflow,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    flow = TestBed.inject(PhotoImportWorkflow);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    http.verify();
  });
  function ready(id = '1', value = request, result = clear): void {
    flow.source(id, 'photo.jpg', {
      ...emptyPhotoDraft(),
      title: value.title,
      author: value.author,
    });
    flow.review(id);
    closed.next(value);
    closed.complete();
    http.expectOne(dup).flush(result);
    if (value.isbn) http.expectOne(exact).flush({ content: [], totalElements: 0 });
  }
  function start(): void {
    flow.importSelected();
    closed.next(true);
    closed.complete();
  }

  it('requires real form review and duplicate check, and starts unselected', () => {
    flow.source('1', 'photo.jpg', emptyPhotoDraft());
    flow.selectAll(true);
    flow.importSelected();
    http.expectNone(posts);
    expect(flow.rows()[0].state).toBe('pending');
    flow.review('1');
    closed.next(request);
    closed.complete();
    expect(flow.rows()[0].state).toBe('reviewed');
    flow.select('1', true);
    expect(flow.selectedCount()).toBe(0);
    http.expectOne(dup).flush(clear);
    expect(flow.rows()[0].state).toBe('ready');
    expect(flow.selectedCount()).toBe(0);
  });
  it('refuses invalid BookRequests even if a dialog returns one', () => {
    flow.source('1', 'manual', emptyPhotoDraft());
    flow.review('1');
    closed.next({ ...request, author: '' });
    closed.complete();
    expect(flow.rows()[0].state).toBe('pending');
    http.expectNone(() => true);
  });
  it('selects only eligible rows and deselects all', () => {
    ready();
    flow.source('2', 'manual', emptyPhotoDraft());
    flow.selectAll(true);
    expect(flow.selectedCount()).toBe(1);
    expect(flow.rows()[1].selected).toBe(false);
    flow.selectAll(false);
    expect(flow.selectedCount()).toBe(0);
  });
  it('invalidates old authorization on editing or opening a new review, including cancel', () => {
    ready();
    flow.select('1', true);
    flow.review('1');
    closed.next(undefined);
    closed.complete();
    expect(flow.rows()[0].state).toBe('pending');
    expect(flow.rows()[0].request).toBeNull();
    expect(flow.selectedCount()).toBe(0);
    flow.source('1', 'photo.jpg', { ...emptyPhotoDraft(), title: 'New draft' });
    expect(flow.rows()[0].draft.title).toBe('New draft');
    expect(flow.rows()[0].duplicates).toBeNull();
  });
  it.each(['EXACT_ISBN', 'EQUIVALENT_ISBN'] as const)('blocks catalog %s without POST', (kind) => {
    ready('1', request, {
      ...clear,
      matches: [{ id: 11, title: 'Existing', author: 'Author', isbn: '0132350882', kind }],
    });
    expect(flow.rows()[0].state).toBe('existing');
    expect(flow.rows()[0].bookId).toBe(11);
    flow.select('1', true);
    flow.importSelected();
    http.expectNone(posts);
  });
  it('also checks exact CRUD ISBN search even when checksum is not lookup-valid', () => {
    const value = { ...request, isbn: '9780132350885' };
    flow.source('1', 'manual', emptyPhotoDraft());
    flow.review('1');
    closed.next(value);
    closed.complete();
    http.expectOne(dup).flush(clear);
    const check = http.expectOne(exact);
    expect(check.request.params.get('isbn')).toBe(value.isbn);
    check.flush({ content: [{ id: 42 }], totalElements: 1 });
    expect(flow.rows()[0].state).toBe('existing');
    expect(flow.rows()[0].bookId).toBe(42);
  });
  it('requires an explicit possible-duplicate decision and never auto-selects after approval', () => {
    ready('1', request, possible);
    expect(flow.rows()[0].state).toBe('possible');
    flow.approvePossible('1');
    closed.next(false);
    closed.complete();
    expect(flow.rows()[0].state).toBe('possible');
    flow.approvePossible('1');
    closed.next(true);
    closed.complete();
    expect(flow.rows()[0].state).toBe('ready');
    expect(flow.rows()[0].selected).toBe(false);
  });
  it('shows a confirmation summary and sends nothing when cancelled', () => {
    ready();
    flow.selectAll(true);
    flow.importSelected();
    expect(open.mock.calls.at(-1)![1].data.titles[0]).toContain('Real book');
    expect(open.mock.calls.at(-1)![1].data.message).toContain('simulado');
    closed.next(false);
    closed.complete();
    http.expectNone(posts);
    expect(flow.creating()).toBe(false);
  });
  it('rechecks immediately before each sequential POST and preserves confirmed IDs', () => {
    ready('1');
    ready('2', { ...request, title: 'Second real book' });
    flow.selectAll(true);
    start();
    http.expectNone(posts);
    http.expectOne(dup).flush(clear);
    const first = http.expectOne(posts);
    expect(first.request.url).toBe('/api/books');
    expect(first.request.body).toEqual(request);
    flow.importSelected();
    http.expectNone(posts);
    http.expectNone(dup);
    first.flush({ id: 101 });
    expect(flow.rows()[0].bookId).toBe(101);
    expect(flow.rows()[0].state).toBe('imported');
    http.expectOne(dup).flush(clear);
    http.expectOne(posts).flush({ id: 102 });
    expect(flow.summary().imported).toBe(2);
    expect(flow.creating()).toBe(false);
    flow.selectAll(true);
    flow.importSelected();
    http.expectNone(posts);
  });
  it('stops new writes but waits for the active POST and retains its result', () => {
    ready('1');
    ready('2');
    flow.selectAll(true);
    start();
    http.expectOne(dup).flush(clear);
    const active = http.expectOne(posts);
    flow.stop();
    expect(active.cancelled).toBe(false);
    expect(flow.creating()).toBe(true);
    active.flush({ id: 101 });
    expect(flow.rows()[0].bookId).toBe(101);
    expect(flow.creating()).toBe(false);
    expect(flow.rows()[1].state).toBe('ready');
    http.expectNone(posts);
    http.expectNone(dup);
  });
  it('does not POST if stopped during preflight', () => {
    ready();
    flow.selectAll(true);
    start();
    const preflight = http.expectOne(dup);
    flow.stop();
    preflight.flush(clear);
    http.expectNone(posts);
    expect(flow.creating()).toBe(false);
  });
  it('catches newly existing or changed possible duplicates during preflight', () => {
    ready();
    flow.selectAll(true);
    start();
    http.expectOne(dup).flush(possible);
    expect(flow.rows()[0].state).toBe('possible');
    http.expectNone(posts);
    expect(flow.creating()).toBe(false);
  });
  it('does not treat failed or malformed duplicate checks as new', () => {
    ready();
    flow.selectAll(true);
    start();
    http.expectOne(dup).flush({}, { status: 500, statusText: 'Failure' });
    expect(flow.rows()[0].state).toBe('error');
    http.expectNone(posts);
  });
  it('keeps partial successes and sends a 400 failure back for a new review', () => {
    ready('1');
    ready('2');
    flow.selectAll(true);
    start();
    http.expectOne(dup).flush(clear);
    http.expectOne(posts).flush({ id: 1 });
    http.expectOne(dup).flush(clear);
    http.expectOne(posts).flush({}, { status: 400, statusText: 'Bad Request' });
    expect(flow.rows()[0].bookId).toBe(1);
    expect(flow.rows()[1].state).toBe('error');
    expect(flow.rows()[1].request).toBeNull();
    expect(flow.summary().imported).toBe(1);
    expect(flow.summary().errors).toBe(1);
    http.expectNone(posts);
  });
  it('reconciles 409 against catalog and never repeats POST automatically', () => {
    ready('1', { ...request, isbn: '0132350882' });
    flow.selectAll(true);
    start();
    http.expectOne(dup).flush(clear);
    http.expectOne(exact).flush({ content: [], totalElements: 0 });
    http.expectOne(posts).flush({}, { status: 409, statusText: 'Conflict' });
    http.expectOne(dup).flush({
      ...clear,
      matches: [
        {
          id: 202,
          title: request.title,
          author: request.author,
          isbn: '0132350882',
          kind: 'EXACT_ISBN',
        },
      ],
    });
    http.expectOne(exact).flush({ content: [{ id: 202 }], totalElements: 1 });
    expect(flow.rows()[0].state).toBe('existing');
    expect(flow.rows()[0].bookId).toBe(202);
    http.expectNone(posts);
  });
  it.each([0, 500, 504])(
    'keeps an ambiguous status %s uncertain and requires explicit risk authorization and review',
    (status) => {
      ready();
      flow.selectAll(true);
      start();
      http.expectOne(dup).flush(clear);
      const post = http.expectOne(posts);
      if (status === 0) post.error(new ProgressEvent('error'));
      else post.flush({}, { status, statusText: 'Failure' });
      expect(flow.rows()[0].state).toBe('uncertain');
      flow.authorizeRetry('1');
      expect(flow.dialogOpen()).toBe(false);
      http.expectOne(dup).flush(possible);
      expect(flow.rows()[0].state).toBe('uncertain');
      expect(flow.rows()[0].message).toContain('sin ISBN');
      flow.selectAll(true);
      flow.importSelected();
      http.expectNone(posts);
      flow.authorizeRetry('1');
      closed.next(true);
      closed.complete();
      expect(flow.rows()[0].state).toBe('pending');
      expect(flow.rows()[0].request).toBeNull();
      http.expectNone(posts);
    },
  );
  it('failed reconciliation removes retry permission instead of retaining stale results', () => {
    ready();
    flow.selectAll(true);
    start();
    http.expectOne(dup).flush(clear);
    http.expectOne(posts).flush({}, { status: 500, statusText: 'Failure' });
    http.expectOne(dup).flush(clear);
    flow.reconcile('1');
    http.expectOne(dup).flush({}, { status: 500, statusText: 'Failure' });
    expect(flow.rows()[0].duplicates).toBeNull();
    flow.authorizeRetry('1');
    expect(flow.dialogOpen()).toBe(false);
    http.expectNone(posts);
  });
  it('discards candidates and ignores cancelled old checks', () => {
    flow.source('1', 'photo.jpg', emptyPhotoDraft());
    flow.review('1');
    closed.next(request);
    closed.complete();
    const check = http.expectOne(dup);
    flow.discard('1');
    expect(check.cancelled).toBe(true);
    expect(flow.rows()[0].state).toBe('discarded');
    flow.source('1', 'photo.jpg', emptyPhotoDraft());
    expect(flow.rows()[0].state).toBe('discarded');
    expect(flow.summary().discarded).toBe(1);
  });
  it('adds a manual candidate through the simple dialog without HTTP, recognition or Book creation', () => {
    flow.addManual();
    expect(open).toHaveBeenCalledWith(ManualCandidateDialog, expect.anything());
    expect(flow.dialogOpen()).toBe(true);
    closed.next({ title: 'Dune', author: 'Frank Herbert', isbn: '', search: false });
    closed.complete();
    expect(flow.dialogOpen()).toBe(false);
    const [row] = flow.rows();
    expect(row.source).toBe(MANUAL_SOURCE);
    expect(row.id.startsWith('manual:')).toBe(true);
    expect(row.state).toBe('pending');
    expect(row.draft).toEqual({ ...emptyPhotoDraft(), title: 'Dune', author: 'Frank Herbert' });
    expect(row.draft.genres).toEqual([]);
    expect(row.request).toBeNull();
    expect(flow.manualCandidates()[0].observation).toMatchObject({
      title: 'Dune',
      author: 'Frank Herbert',
      rawIsbn: null,
      visibleText: null,
    });
    expect(flow.searchRequest()).toBeNull();
    flow.selectAll(true);
    expect(flow.selectedCount()).toBe(0);
    http.expectNone(() => true);
  });

  it('requests a bibliographic search only when the dialog asks for it', () => {
    flow.addManual();
    closed.next({ title: 'Dune', author: 'Herbert', isbn: '9780132350884', search: true });
    closed.complete();
    expect(flow.searchRequest()).toBe(flow.rows()[0].id);
    expect(flow.manualCandidates()[0].observation.rawIsbn).toBe('9780132350884');
    expect(flow.rows()[0].draft.isbn).toBe('9780132350884');
    http.expectNone(() => true);
  });

  it('creates nothing when the manual dialog is cancelled and keeps photograph candidates', () => {
    flow.source('photo:1:a', 'photo.jpg', { ...emptyPhotoDraft(), title: 'Photo book' });
    flow.addManual();
    closed.next(undefined);
    closed.complete();
    expect(flow.dialogOpen()).toBe(false);
    expect(flow.manualCandidates()).toEqual([]);
    expect(flow.rows().map((row) => row.id)).toEqual(['photo:1:a']);
    flow.addManual();
    closed.next({ title: 'Manual', author: 'Author', isbn: '', search: false });
    closed.complete();
    expect(flow.rows().map((row) => row.id)).toEqual(['photo:1:a', 'manual:1']);
    expect(flow.rows()[0].draft.title).toBe('Photo book');
    http.expectNone(() => true);
  });

  it('does not open the manual dialog while another write or dialog is active', () => {
    flow.addManual();
    flow.addManual();
    expect(open).toHaveBeenCalledTimes(1);
    closed.next(undefined);
    closed.complete();
  });

  it('imports a reviewed manual candidate without genres or ISBN only after explicit confirmation', () => {
    flow.addManual();
    closed.next({ title: 'Real book', author: 'Real author', isbn: '', search: false });
    closed.complete();
    const id = flow.rows()[0].id;
    flow.selectAll(true);
    flow.importSelected();
    http.expectNone(posts);
    flow.review(id);
    closed.next(request);
    closed.complete();
    http.expectOne(dup).flush(clear);
    expect(flow.rows()[0].state).toBe('ready');
    expect(flow.rows()[0].request?.genres).toEqual([]);
    expect(flow.rows()[0].request?.isbn).toBeNull();
    flow.selectAll(true);
    start();
    http.expectOne(dup).flush(clear);
    const post = http.expectOne(posts);
    expect(post.request.body).toEqual(request);
    expect((post.request.body as BookRequest).genres).toEqual([]);
    post.flush({ ...request, id: 9, readingStatus: 'TO_READ', rating: null });
    expect(flow.rows()[0].state).toBe('imported');
    expect(flow.rows()[0].bookId).toBe(9);
  });

  it('keeps the exact-ISBN and possible-duplicate protections for manual candidates', () => {
    flow.addManual();
    closed.next({ title: 'Real book', author: 'Real author', isbn: '', search: false });
    closed.complete();
    const id = flow.rows()[0].id;
    flow.review(id);
    closed.next(request);
    closed.complete();
    http.expectOne(dup).flush(possible);
    expect(flow.rows()[0].state).toBe('possible');
    flow.selectAll(true);
    expect(flow.selectedCount()).toBe(0);
    http.expectNone(posts);
  });
  it('warns before abandoning reviewed pending work and blocks navigation during writes', () => {
    expect(flow.canLeave()).toBe(true);
    ready();
    const leave = flow.canLeave() as Observable<boolean>;
    const accepted = vi.fn();
    leave.subscribe(accepted);
    closed.next(false);
    closed.complete();
    expect(accepted).toHaveBeenCalledWith(false);
    flow.selectAll(true);
    start();
    const preflight = http.expectOne(dup);
    expect(flow.canLeave()).toBe(false);
    flow.stop();
    preflight.flush(clear);
  });
});
