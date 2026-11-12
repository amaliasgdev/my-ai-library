import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { testBook, testBookPage } from '../../../books/models/book.testing';
import { SagaBookPickerDialog } from '../../components/saga-book-picker-dialog/saga-book-picker-dialog';
import { SagaVolumeConfirmDialog } from '../../components/saga-volume-confirm-dialog/saga-volume-confirm-dialog';
import { SagaVolumeFormDialog } from '../../components/saga-volume-form-dialog/saga-volume-form-dialog';
import {
  testPendingSagaVolume,
  testSaga,
  testSagaProgress,
  testSagaVolume,
  testSagaVolumeBook,
  testSagaVolumes,
} from '../../models/saga.testing';
import { SagaResponse, SagaVolume } from '../../models/saga.models';
import { SagaDetail } from './saga-detail';

describe('SagaDetail', () => {
  let fixture: ComponentFixture<SagaDetail>;
  let page: SagaDetail;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: '42' }));
    TestBed.configureTestingModule({
      imports: [SagaDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params.asObservable(),
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(SagaDetail);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.inject(MatDialog).closeAll();
    http.verify();
  });

  function sagaRequest() {
    return http.expectOne((request) => request.url === '/api/sagas/42' && request.method === 'GET');
  }

  function volumesRequest() {
    return http.expectOne(
      (request) => request.url === '/api/sagas/42/volumes' && request.method === 'GET',
    );
  }

  function load(sagaOverrides: Partial<SagaResponse> = {}, volumes = testSagaVolumes()): void {
    sagaRequest().flush(testSaga({ id: 42, revision: volumes.revision, ...sagaOverrides }));
    volumesRequest().flush(volumes);
    fixture.detectChanges();
  }

  async function confirmSagaDelete() {
    page.openDeleteDialog();
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Eliminar saga' }))).click();
    await vi.waitFor(() => expect(page.deleting()).toBe(true));
    return http.expectOne(
      (request) => request.url === '/api/sagas/42' && request.method === 'DELETE',
    );
  }

  async function confirmVolumeDialog(confirmed = true) {
    await fixture.whenStable();
    const dialogs = TestBed.inject(MatDialog).openDialogs;
    dialogs[dialogs.length - 1].close(confirmed);
    await fixture.whenStable();
  }

  async function waitForWrite(method: string, url: string): Promise<TestRequest> {
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      request = http.expectOne((candidate) => candidate.method === method && candidate.url === url);
    });
    return request!;
  }

  it('announces loading and requests both the saga and its ordered volumes', () => {
    expect(page.state().status).toBe('loading');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Cargando saga');
    sagaRequest().flush(testSaga({ id: 42 }));
    volumesRequest().flush(testSagaVolumes());
  });

  it.each(['0', '-1', 'new', 'abc', ' 42', '4.2', '9007199254740992', ''])(
    'rejects invalid id %s without requesting or retrying',
    (id) => {
      const previousSaga = sagaRequest();
      const previousVolumes = volumesRequest();
      params.next(convertToParamMap({ id }));
      fixture.detectChanges();
      expect(previousSaga.cancelled).toBe(true);
      expect(previousVolumes.cancelled).toBe(true);
      expect(element.querySelector('[role="alert"]')?.textContent).toBe(
        'El identificador de la saga no es válido',
      );
      expect(element.textContent).not.toContain('Reintentar');
      page.retry();
      http.expectNone((request) => request.url.startsWith('/api/sagas/'));
    },
  );

  it('shows load errors and retries only the reads', () => {
    volumesRequest().flush(testSagaVolumes());
    sagaRequest().flush({ detail: 'SECRET' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(page.state()).toEqual({ status: 'error', message: 'La saga no existe' });
    page.retry();
    sagaRequest().flush(testSaga({ id: 42 }));
    volumesRequest().flush(testSagaVolumes());
    fixture.detectChanges();
    expect(page.state().status).toBe('loaded');
  });

  it('renders both progress indicators with explicit text', () => {
    load(
      {
        name: 'Nacidos de la bruma',
        author: 'Brandon Sanderson',
        description: 'Fantasía ambientada en Scadrial',
      },
      testSagaVolumes({
        progress: testSagaProgress({
          total: 5,
          linked: 3,
          pending: 2,
          read: 1,
          reading: 1,
          toRead: 1,
          abandoned: 0,
        }),
      }),
    );

    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Nacidos de la bruma');
    expect(element.textContent).toContain('Brandon Sanderson');
    expect(element.textContent).toContain('Fantasía ambientada en Scadrial');
    expect(element.textContent).toContain('3 de 5 volúmenes en la biblioteca');
    expect(element.textContent).toContain('1 de 5 volúmenes leídos');
    expect(element.textContent).toContain('60%');
    expect(element.textContent).toContain('20%');
    expect(element.querySelectorAll('mat-progress-bar')).toHaveLength(2);
  });

  it('renders ordered linked and pending volumes with real book data', () => {
    load(
      {},
      testSagaVolumes({
        revision: '2',
        progress: testSagaProgress({
          total: 2,
          linked: 1,
          pending: 1,
          read: 1,
          reading: 0,
          toRead: 0,
          abandoned: 0,
        }),
        volumes: [
          testSagaVolume({
            id: 100,
            position: 1,
            volumeLabel: '1',
            bookId: 10,
            book: testSagaVolumeBook({
              id: 10,
              title: 'El imperio final',
              author: 'Brandon Sanderson',
              readingStatus: 'READ',
            }),
          }),
          testPendingSagaVolume({
            id: 200,
            position: 2,
            volumeLabel: '0.5',
            pendingTitle: 'Precuela',
          }),
        ],
      }),
    );

    const cards = element.querySelectorAll<HTMLElement>('app-saga-volume-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Posición 1');
    expect(cards[0].textContent).toContain('El imperio final');
    expect(cards[0].textContent).toContain('Brandon Sanderson');
    expect(cards[0].textContent).toContain('Leído');
    expect(cards[0].querySelector('a')?.getAttribute('href')).toBe('/books/10');
    expect(cards[1].textContent).toContain('Posición 2');
    expect(cards[1].textContent).toContain('0.5');
    expect(cards[1].textContent).toContain('Precuela');
    expect(cards[1].textContent).toContain('Pendiente de incorporar');
    expect(cards[1].textContent).not.toContain('Leído');
  });

  it('handles an empty saga and offers both add actions', () => {
    load(
      { description: null },
      testSagaVolumes({
        progress: testSagaProgress({
          total: 0,
          linked: 0,
          pending: 0,
          read: 0,
          reading: 0,
          toRead: 0,
          abandoned: 0,
        }),
        volumes: [],
      }),
    );
    expect(element.textContent).toContain('Esta saga todavía no tiene volúmenes');
    expect(element.textContent).toContain('0 de 0 volúmenes en la biblioteca');
    expect(element.textContent).toContain('Sin descripción');
    expect(element.textContent).not.toContain('NaN');
    expect(element.textContent).toContain('Añadir libro de la biblioteca');
    expect(element.textContent).toContain('Registrar volumen pendiente');
  });

  it('adds a pending volume through the form dialog and updates progress', async () => {
    load();
    page.openAddPending();
    fixture.detectChanges();
    const dialog = TestBed.inject(MatDialog).openDialogs[0]
      .componentInstance as SagaVolumeFormDialog;
    dialog.form.patchValue({ pendingTitle: '  Precuela  ', volumeLabel: '  0.5  ' });
    dialog.submit();
    await fixture.whenStable();

    const post = await waitForWrite('POST', '/api/sagas/42/volumes');
    expect(post.request.body).toEqual({
      bookId: null,
      pendingTitle: 'Precuela',
      volumeLabel: '0.5',
      expectedRevision: '1',
    });
    post.flush({ revision: '2', volume: testPendingSagaVolume() });
    volumesRequest().flush(
      testSagaVolumes({
        revision: '2',
        progress: testSagaProgress({
          total: 2,
          linked: 1,
          pending: 1,
          read: 1,
          reading: 0,
          toRead: 0,
          abandoned: 0,
        }),
        volumes: [
          testSagaVolume(),
          testPendingSagaVolume({ pendingTitle: 'Precuela', volumeLabel: '0.5' }),
        ],
      }),
    );
    fixture.detectChanges();
    expect(element.textContent).toContain('Precuela');
    expect(element.textContent).toContain('2');
  });

  it('adds a linked book from the catalog picker', async () => {
    load();
    page.openAddBook();
    fixture.detectChanges();
    const dialog = TestBed.inject(MatDialog).openDialogs[0]
      .componentInstance as SagaBookPickerDialog;
    dialog.searchForm.controls.title.setValue('Dune');
    dialog.search();
    http
      .expectOne((request) => request.url === '/api/books/search')
      .flush(
        testBookPage({
          content: [testBook({ id: 77, title: 'Dune', author: 'Frank Herbert' })],
        }),
      );
    dialog.select(dialog.results()!.content[0]);
    dialog.confirm();
    await fixture.whenStable();

    const post = await waitForWrite('POST', '/api/sagas/42/volumes');
    expect(post.request.body).toEqual({
      bookId: 77,
      pendingTitle: null,
      volumeLabel: null,
      expectedRevision: '1',
    });
    post.flush({ revision: '2', volume: testSagaVolume({ bookId: 77 }) });
    volumesRequest().flush(testSagaVolumes({ revision: '2' }));
  });

  it('edits a pending volume and an existing linked label', async () => {
    load();
    page.editVolume(testPendingSagaVolume());
    fixture.detectChanges();
    const dialog = TestBed.inject(MatDialog).openDialogs[0]
      .componentInstance as SagaVolumeFormDialog;
    dialog.form.patchValue({ pendingTitle: 'Nuevo título', volumeLabel: '2' });
    dialog.submit();
    await fixture.whenStable();

    const put = await waitForWrite('PUT', '/api/sagas/42/volumes/200');
    expect(put.request.body).toEqual({
      pendingTitle: 'Nuevo título',
      volumeLabel: '2',
      expectedRevision: '1',
    });
    put.flush({ revision: '2', volume: testPendingSagaVolume() });
    volumesRequest().flush(testSagaVolumes({ revision: '2' }));
  });

  it('links a pending volume without changing the row', async () => {
    load(
      {},
      testSagaVolumes({
        volumes: [testPendingSagaVolume()],
        progress: testSagaProgress({
          total: 1,
          linked: 0,
          pending: 1,
          read: 0,
          reading: 0,
          toRead: 0,
          abandoned: 0,
        }),
      }),
    );
    page.linkVolume(testPendingSagaVolume());
    fixture.detectChanges();
    const picker = TestBed.inject(MatDialog).openDialogs[0]
      .componentInstance as SagaBookPickerDialog;
    picker.searchForm.controls.author.setValue('Brandon Sanderson');
    picker.search();
    http
      .expectOne((request) => request.url === '/api/books/search')
      .flush(testBookPage({ content: [testBook({ id: 10 })] }));
    picker.select(picker.results()!.content[0]);
    picker.confirm();
    await fixture.whenStable();

    const link = await waitForWrite('POST', '/api/sagas/42/volumes/200/link');
    expect(link.request.body).toEqual({ bookId: 10, expectedRevision: '1' });
    link.flush({ revision: '2', volume: testSagaVolume({ id: 200 }) });
    volumesRequest().flush(testSagaVolumes({ revision: '2' }));
  });

  it('unlinks a book only after confirmation and keeps the volume', async () => {
    load();
    page.unlinkVolume(testSagaVolume());
    fixture.detectChanges();
    expect(
      (TestBed.inject(MatDialog).openDialogs[0].componentInstance as SagaVolumeConfirmDialog).data
        .mode,
    ).toBe('unlink');
    await confirmVolumeDialog(true);

    const unlink = await waitForWrite('POST', '/api/sagas/42/volumes/100/unlink');
    expect(unlink.request.body).toEqual({ pendingTitle: null, expectedRevision: '1' });
    unlink.flush({ revision: '2', volume: testPendingSagaVolume({ id: 100 }) });
    volumesRequest().flush(
      testSagaVolumes({
        revision: '2',
        volumes: [
          testPendingSagaVolume({ id: 100, position: 1, pendingTitle: 'El imperio final' }),
        ],
        progress: testSagaProgress({
          total: 1,
          linked: 0,
          pending: 1,
          read: 0,
          reading: 0,
          toRead: 0,
          abandoned: 0,
        }),
      }),
    );
    fixture.detectChanges();
    expect(element.textContent).toContain('Pendiente de incorporar');
  });

  it('moves with buttons, no-ops unsuccessfully and supports drag and drop', () => {
    const ordered = [
      testSagaVolume({ id: 1, position: 1 }),
      testSagaVolume({ id: 2, position: 2 }),
      testSagaVolume({ id: 3, position: 3 }),
    ];
    load({}, testSagaVolumes({ volumes: ordered }));
    const firstState = page.state();
    const first = firstState.status === 'loaded' ? firstState.volumes.volumes[0] : null;
    expect(first).not.toBeNull();

    page.moveUp(first!);
    http.expectNone((request) => request.method === 'POST' && request.url.includes('/move'));

    page.moveDown(first!);
    const down = http.expectOne(
      (request) => request.url === '/api/sagas/42/volumes/1/move' && request.method === 'POST',
    );
    expect(down.request.body).toEqual({ toPosition: 2, expectedRevision: '1' });
    down.flush({ revision: '2', volumeId: 1, position: 2 });
    volumesRequest().flush(testSagaVolumes({ revision: '2', volumes: ordered }));

    page.drop({
      previousIndex: 0,
      currentIndex: 2,
      item: { data: first },
    } as CdkDragDrop<SagaVolume[]>);
    const drop = http.expectOne(
      (request) => request.url === '/api/sagas/42/volumes/1/move' && request.method === 'POST',
    );
    expect(drop.request.body).toEqual({ toPosition: 3, expectedRevision: '2' });
    drop.flush({ revision: '3', volumeId: 1, position: 3 });
    volumesRequest().flush(testSagaVolumes({ revision: '3', volumes: ordered }));
  });

  it('removes a volume after confirmation and reloads compacted positions', async () => {
    load();
    page.removeVolume(testSagaVolume());
    fixture.detectChanges();
    expect(
      (TestBed.inject(MatDialog).openDialogs[0].componentInstance as SagaVolumeConfirmDialog).data
        .mode,
    ).toBe('remove');
    await confirmVolumeDialog(true);

    const deletion = await waitForWrite('DELETE', '/api/sagas/42/volumes/100');
    expect(deletion.request.params.get('expectedRevision')).toBe('1');
    deletion.flush({ revision: '2' });
    volumesRequest().flush(
      testSagaVolumes({
        revision: '2',
        volumes: [],
        progress: testSagaProgress({
          total: 0,
          linked: 0,
          pending: 0,
          read: 0,
          reading: 0,
          toRead: 0,
          abandoned: 0,
        }),
      }),
    );
    fixture.detectChanges();
    expect(element.textContent).toContain('Esta saga todavía no tiene volúmenes');
  });

  it('does not retry a stale write, reloads the list and reports the conflict', () => {
    load(
      {},
      testSagaVolumes({
        volumes: [
          testSagaVolume({ id: 100, position: 1 }),
          testSagaVolume({ id: 101, position: 2 }),
        ],
      }),
    );
    const conflictState = page.state();
    const volume = conflictState.status === 'loaded' ? conflictState.volumes.volumes[0] : null;
    page.moveDown(volume!);
    const move = http.expectOne(
      (request) => request.url === '/api/sagas/42/volumes/100/move' && request.method === 'POST',
    );
    move.flush({ code: 'SAGA_REVISION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(page.volumeError()).toContain('La saga ha cambiado');
    const refresh = volumesRequest();
    refresh.flush(testSagaVolumes({ revision: '2' }));
    fixture.detectChanges();
    expect(page.volumeError()).toContain('La saga ha cambiado');
    http.expectNone(
      (request) => request.url === '/api/sagas/42/volumes/100/move' && request.method === 'POST',
    );
  });

  it('reports a failed refresh after a successful write and retries it explicitly', async () => {
    const ordered = [
      testSagaVolume({ id: 100, position: 1 }),
      testSagaVolume({ id: 101, position: 2 }),
    ];
    load({}, testSagaVolumes({ volumes: ordered }));
    page.moveDown(ordered[0]);
    const move = http.expectOne(
      (request) => request.url === '/api/sagas/42/volumes/100/move' && request.method === 'POST',
    );
    move.flush({ revision: '2', volumeId: 100, position: 2 });
    volumesRequest().flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(page.refreshError()).toContain('no se pudo actualizar la lista de volúmenes');
    const retry = element.querySelector<HTMLButtonElement>('.feedback-action');
    expect(retry?.textContent?.trim()).toBe('Reintentar actualización');
    retry!.click();
    volumesRequest().flush(testSagaVolumes({ revision: '2', volumes: ordered }));
    fixture.detectChanges();
    expect(page.refreshError()).toBeNull();
  });

  it('does not write when a volume dialog is cancelled', async () => {
    load();
    page.openAddPending();
    fixture.detectChanges();
    await confirmVolumeDialog(false);
    http.expectNone((request) => request.method === 'POST' && request.url.includes('/volumes'));

    page.openAddBook();
    fixture.detectChanges();
    await fixture.whenStable();
    (TestBed.inject(MatDialog).openDialogs[0].componentInstance as SagaBookPickerDialog).cancel();
    await fixture.whenStable();
    http.expectNone((request) => request.method === 'POST' && request.url.includes('/volumes'));
  });

  it('keeps the reloaded saga revision after a volume mutation before deleting the saga', async () => {
    const ordered = [
      testSagaVolume({ id: 100, position: 1 }),
      testSagaVolume({ id: 101, position: 2 }),
    ];
    load({ revision: '1' }, testSagaVolumes({ revision: '1', volumes: ordered }));
    page.moveDown(ordered[0]);
    const move = http.expectOne(
      (request) => request.url === '/api/sagas/42/volumes/100/move' && request.method === 'POST',
    );
    move.flush({ revision: '2', volumeId: 100, position: 2 });
    volumesRequest().flush(testSagaVolumes({ revision: '2', volumes: ordered }));
    fixture.detectChanges();

    const deletion = await confirmSagaDelete();
    expect(deletion.request.params.get('expectedRevision')).toBe('2');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('does not delete the saga when the confirmation is cancelled', async () => {
    load();
    page.openDeleteDialog();
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatDialogHarness)).close();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    http.expectNone((request) => request.method === 'DELETE');
  });

  it('deletes the saga with the current revision and navigates to the list', async () => {
    load({ revision: '6' });
    const deletion = await confirmSagaDelete();
    expect(deletion.request.params.get('expectedRevision')).toBe('6');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    expect(navigate).toHaveBeenCalledWith(['/sagas']);
  });

  it('reloads the saga and volumes after a 409 on deletion', async () => {
    load({ revision: '0' });
    const first = await confirmSagaDelete();
    first.flush({ code: 'SAGA_REVISION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(page.deleteError()).toContain('La saga ha cambiado');
    sagaRequest().flush(testSaga({ id: 42, revision: '1' }));
    volumesRequest().flush(testSagaVolumes({ revision: '1' }));
    fixture.detectChanges();
    expect(page.state().status).toBe('loaded');

    const second = await confirmSagaDelete();
    expect(second.request.params.get('expectedRevision')).toBe('1');
    second.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('falls back to a placeholder when the saga image fails', () => {
    load({ imageUrl: 'https://example.test/broken.jpg' });
    const image = element.querySelector('img')!;
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('Sin imagen');
  });
});
