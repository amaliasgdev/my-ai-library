import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import {
  PhotoImportCandidate,
  PhotoImportWorkflow,
  emptyPhotoDraft,
} from './photo-import-workflow';
import { PhotoReadingListWorkflow } from './photo-reading-list-workflow';

describe('PhotoReadingListWorkflow (mocked HTTP only)', () => {
  let flow: PhotoReadingListWorkflow;
  let http: HttpTestingController;
  let closed: Subject<boolean>;
  const open = vi.fn();
  const membership = (r: { url: string }) => r.url === '/api/reading-list/membership';
  const listUrl = '/api/reading-list';
  const postUrl = '/api/reading-list/items';
  function candidate(
    id: number,
    state: PhotoImportCandidate['state'] = 'imported',
    source = `source:${id}`,
  ): PhotoImportCandidate {
    return {
      id: source,
      source: 'photo.jpg',
      draft: { ...emptyPhotoDraft(), title: `Book ${id}`, author: 'Author' },
      request: null,
      state,
      selected: false,
      revision: 1,
      duplicates: null,
      approvedMatches: null,
      bookId: id,
      message: null,
    };
  }
  const list = (revision: string, ids: number[] = []) => ({
    revision,
    totalItems: ids.length,
    items: ids.map((id, i) => ({ entryId: id + 100, position: i, book: { id } })),
  });
  const added = (revision: string, bookId: number) => ({
    revision,
    item: { entryId: 200 + bookId, position: 0, book: { id: bookId } },
  });
  beforeEach(() => {
    open.mockReset();
    open.mockImplementation(() => {
      closed = new Subject<boolean>();
      return { afterClosed: () => closed.asObservable(), close: () => closed.complete() };
    });
    TestBed.configureTestingModule({
      providers: [
        PhotoReadingListWorkflow,
        PhotoImportWorkflow,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open } },
      ],
    });
    flow = TestBed.inject(PhotoReadingListWorkflow);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    http.verify();
  });
  function availability(ids: number[], included: number[] = [], revision = '5') {
    flow.refresh();
    const request = http.expectOne(membership);
    expect(request.request.params.getAll('bookId')).toEqual(ids.map(String));
    request.flush({
      revision,
      items: ids.map((bookId) => ({
        bookId,
        included: included.includes(bookId),
        entryId: included.includes(bookId) ? bookId + 100 : null,
      })),
    });
  }
  function start(revision = '5', present: number[] = []) {
    flow.addSelected();
    expect(open.mock.calls.at(-1)![1].data.heading).toContain('Añadir seleccionados');
    closed.next(true);
    closed.complete();
    http.expectOne(listUrl).flush(list(revision, present));
  }
  function reconcile(id: number, included: boolean, revision = '6') {
    http
      .expectOne(membership)
      .flush({ revision, items: [{ bookId: id, included, entryId: included ? 100 + id : null }] });
    http.expectOne(listUrl).flush(list(revision, included ? [id] : []));
  }
  it('includes only confirmed catalogue IDs, excludes ambiguous/unimported/discarded/uncertain candidates, starts unselected', () => {
    flow.setCandidates([
      candidate(1),
      candidate(2, 'existing'),
      candidate(3, 'possible'),
      candidate(4, 'uncertain'),
      candidate(5, 'discarded'),
      candidate(6, 'ready'),
      { ...candidate(7), bookId: null },
    ]);
    expect(flow.entries().map((e) => e.bookId)).toEqual([1, 2]);
    expect(flow.entries()[1].confirmed).toBe(false);
    flow.selectAll(true);
    expect(flow.selectedCount()).toBe(0);
    http.expectNone(() => true);
    availability([1]);
    expect(flow.selectedCount()).toBe(0);
  });
  it('requires explicit identity confirmation for existing Books before batched membership', () => {
    flow.setCandidates([candidate(2, 'existing')]);
    flow.confirmIdentity(2);
    closed.next(false);
    closed.complete();
    expect(flow.entries()[0].confirmed).toBe(false);
    flow.confirmIdentity(2);
    closed.next(true);
    closed.complete();
    expect(flow.entries()[0].confirmed).toBe(true);
    availability([2]);
    expect(flow.entries()[0].state).toBe('available');
    expect(flow.entries()[0].selected).toBe(false);
  });
  it('deduplicates IDs within a batch and keeps a confirmed identity when repeated sources change', () => {
    flow.setCandidates([candidate(1, 'existing', 'a'), candidate(1, 'imported', 'b')]);
    availability([1]);
    flow.select(1, true);
    flow.setCandidates([
      candidate(1, 'existing', 'a'),
      candidate(1, 'imported', 'b'),
      candidate(2),
    ]);
    expect(flow.entries()).toHaveLength(2);
    expect(flow.entries()[0].state).toBe('available');
    expect(flow.entries()[0].selected).toBe(true);
  });
  it('consults membership in chunks of at most 100 without per-book GETs', () => {
    flow.setCandidates(Array.from({ length: 101 }, (_, i) => candidate(i + 1)));
    flow.refresh();
    const first = http.expectOne(membership);
    expect(first.request.params.getAll('bookId')).toHaveLength(100);
    first.flush({
      revision: '0',
      items: Array.from({ length: 100 }, (_, i) => ({
        bookId: i + 1,
        included: false,
        entryId: null,
      })),
    });
    const second = http.expectOne(membership);
    expect(second.request.params.getAll('bookId')).toEqual(['101']);
    second.flush({ revision: '0', items: [{ bookId: 101, included: false, entryId: null }] });
    expect(flow.checking()).toBe(false);
  });
  it('does not select or add Books already included', () => {
    flow.setCandidates([candidate(1), candidate(2)]);
    availability([1, 2], [1]);
    flow.selectAll(true);
    expect(flow.selectedCount()).toBe(1);
    start();
    const post = http.expectOne(postUrl);
    expect(post.request.body.bookId).toBe(2);
    post.flush(added('6', 2));
    flow.refresh();
    http.expectNone(membership);
    expect(flow.summary().included).toBe(1);
    expect(flow.summary().added).toBe(1);
  });
  it('never interprets a failed or incomplete membership response as absence', () => {
    flow.setCandidates([candidate(1)]);
    flow.refresh();
    http.expectOne(membership).flush({}, { status: 500, statusText: 'Failure' });
    expect(flow.entries()[0].state).toBe('unknown');
    flow.selectAll(true);
    flow.addSelected();
    http.expectNone(postUrl);
    flow.refresh();
    http.expectOne(membership).flush({ revision: '1', items: [] });
    expect(flow.entries()[0].state).toBe('unknown');
  });
  it('requires a separate explicit confirmation and fetches a fresh revision before writing', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.select(1, true);
    flow.addSelected();
    closed.next(false);
    closed.complete();
    http.expectNone(listUrl);
    http.expectNone(postUrl);
    expect(flow.busy()).toBe(false);
    start('12');
    const post = http.expectOne(postUrl);
    expect(post.request.body).toEqual({ bookId: 1, expectedRevision: '12' });
    post.flush(added('13', 1));
  });
  it('keeps selection order and decimal revision strings beyond Number precision across sequential writes', () => {
    flow.setCandidates([candidate(1), candidate(2), candidate(3)]);
    availability([1, 2, 3]);
    flow.select(3, true);
    flow.select(1, true);
    flow.select(2, true);
    start('9007199254740993');
    const first = http.expectOne(postUrl);
    expect(first.request.body).toEqual({ bookId: 3, expectedRevision: '9007199254740993' });
    http.expectNone(postUrl);
    first.flush(added('9007199254740994', 3));
    const second = http.expectOne(postUrl);
    expect(second.request.body).toEqual({ bookId: 1, expectedRevision: '9007199254740994' });
    second.flush(added('9007199254740995', 1));
    const third = http.expectOne(postUrl);
    expect(third.request.body).toEqual({ bookId: 2, expectedRevision: '9007199254740995' });
    third.flush(added('9007199254740996', 2));
    expect(flow.summary().added).toBe(3);
    expect(flow.busy()).toBe(false);
    flow.selectAll(true);
    flow.addSelected();
    http.expectNone(postUrl);
  });
  it('skips Books that became included between membership and the initial revision GET', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    start('6', [1]);
    expect(flow.entries()[0].state).toBe('included');
    expect(flow.busy()).toBe(false);
    http.expectNone(postUrl);
  });
  it('does not POST when the initial revision GET fails or returns a numeric revision', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    flow.addSelected();
    closed.next(true);
    closed.complete();
    http.expectOne(listUrl).flush({ ...list('5'), revision: 5 });
    http.expectNone(postUrl);
    expect(flow.busy()).toBe(false);
  });
  it('waits for the active write when stopped and never starts the next one', () => {
    flow.setCandidates([candidate(1), candidate(2)]);
    availability([1, 2]);
    flow.selectAll(true);
    start();
    const post = http.expectOne(postUrl);
    flow.stop();
    expect(post.cancelled).toBe(false);
    expect(flow.busy()).toBe(true);
    post.flush(added('6', 1));
    expect(flow.summary().added).toBe(1);
    expect(flow.entries()[1].state).toBe('available');
    expect(flow.busy()).toBe(false);
    http.expectNone(postUrl);
  });
  it('can stop during the revision read before any write', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    flow.addSelected();
    closed.next(true);
    closed.complete();
    flow.stop();
    http.expectOne(listUrl).flush(list('5'));
    http.expectNone(postUrl);
    expect(flow.busy()).toBe(false);
  });
  it('reconciles a 409 already-included result without another POST', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    start();
    http.expectOne(postUrl).flush({}, { status: 409, statusText: 'Conflict' });
    reconcile(1, true);
    expect(flow.entries()[0].state).toBe('included');
    expect(flow.busy()).toBe(false);
    http.expectNone(postUrl);
  });
  it('pauses on revision conflict and requires explicit preparation, reselection and confirmation', () => {
    flow.setCandidates([candidate(1), candidate(2)]);
    availability([1, 2]);
    flow.selectAll(true);
    start();
    http.expectOne(postUrl).flush({}, { status: 409, statusText: 'Conflict' });
    reconcile(1, false, '10');
    expect(flow.entries()[0].state).toBe('error');
    expect(flow.entries()[0].absentConfirmed).toBe(true);
    http.expectNone(postUrl);
    flow.prepareRetry(1);
    closed.next(true);
    closed.complete();
    expect(flow.entries()[0].state).toBe('available');
    expect(flow.entries()[0].selected).toBe(false);
    flow.select(1, true);
    start('11');
    const first = http.expectOne(postUrl);
    expect(first.request.body.bookId).toBe(2);
    first.flush(added('12', 2));
    const retry = http.expectOne(postUrl);
    expect(retry.request.body).toEqual({ bookId: 1, expectedRevision: '12' });
    retry.flush(added('13', 1));
  });
  it.each([0, 500, 504])(
    'keeps ambiguous status %s uncertain after an absent membership result and never auto-retries',
    (status) => {
      flow.setCandidates([candidate(1)]);
      availability([1]);
      flow.selectAll(true);
      start();
      const post = http.expectOne(postUrl);
      if (status === 0) post.error(new ProgressEvent('error'));
      else post.flush({}, { status, statusText: 'Failure' });
      reconcile(1, false);
      expect(flow.entries()[0].state).toBe('uncertain');
      expect(flow.pending()).toBe(true);
      http.expectNone(postUrl);
      flow.prepareRetry(1);
      closed.next(false);
      closed.complete();
      expect(flow.entries()[0].state).toBe('uncertain');
      flow.prepareRetry(1);
      closed.next(true);
      closed.complete();
      expect(flow.entries()[0].state).toBe('available');
      expect(flow.selectedCount()).toBe(0);
      http.expectNone(postUrl);
    },
  );
  it('resolves an ambiguous operation as currently included, without falsely claiming our POST created it', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    start();
    http.expectOne(postUrl).flush({}, { status: 500, statusText: 'Failure' });
    reconcile(1, true);
    expect(flow.entries()[0].state).toBe('included');
    expect(flow.summary().added).toBe(0);
    http.expectNone(postUrl);
  });
  it('retains uncertainty across failed membership refreshes and does not enable selection', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    start();
    http.expectOne(postUrl).flush({}, { status: 500, statusText: 'Failure' });
    reconcile(1, false);
    flow.refresh();
    http.expectOne(membership).flush({}, { status: 500, statusText: 'Failure' });
    expect(flow.pending()).toBe(true);
    availability([1]);
    expect(flow.entries()[0].state).toBe('uncertain');
    flow.selectAll(true);
    expect(flow.selectedCount()).toBe(0);
  });
  it('does not trust malformed add confirmations or retry when reconciliation fails', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    start();
    http.expectOne(postUrl).flush({ revision: 6, item: { book: { id: 1 } } });
    http.expectOne(membership).flush({}, { status: 500, statusText: 'Failure' });
    http.expectOne(listUrl);
    expect(flow.entries()[0].state).toBe('uncertain');
    expect(flow.entries()[0].absentConfirmed).toBe(false);
    flow.prepareRetry(1);
    http.expectNone(postUrl);
  });
  it('preserves partial success, remaining work and the imported Books after a list failure', () => {
    const books = [candidate(1), candidate(2), candidate(3)];
    flow.setCandidates(books);
    availability([1, 2, 3]);
    flow.selectAll(true);
    start();
    http.expectOne(postUrl).flush(added('6', 1));
    http.expectOne(postUrl).flush({}, { status: 400, statusText: 'Bad Request' });
    reconcile(2, false);
    expect(flow.entries().map((e) => e.state)).toEqual(['added', 'error', 'available']);
    expect(books.map((r) => r.state)).toEqual(['imported', 'imported', 'imported']);
    expect(books.map((r) => r.bookId)).toEqual([1, 2, 3]);
    http.expectNone((r) => r.url === '/api/books' || r.method === 'DELETE');
  });
  it('locks catalog creation and navigation while a reading-list write is active', () => {
    const books = TestBed.inject(PhotoImportWorkflow);
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    start();
    const post = http.expectOne(postUrl);
    expect(books.locked()).toBe(true);
    expect(books.canLeave()).toBe(false);
    books.addManual();
    expect(books.rows()).toHaveLength(0);
    post.flush(added('6', 1));
    expect(books.locked()).toBe(false);
  });
  it('does not start list actions during catalog creation or a catalog dialog', () => {
    flow.setCandidates([candidate(1)]);
    availability([1]);
    flow.selectAll(true);
    flow.setBlocker(() => true);
    flow.addSelected();
    http.expectNone(listUrl);
    expect(open).not.toHaveBeenCalled();
  });
});
