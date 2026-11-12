import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  testSaga,
  testSagaPage,
  testSagaRequest,
  testSagaVolumes,
  testSagaVolume,
  testPendingSagaVolume,
} from '../models/saga.testing';
import { SagasService } from './sagas.service';

describe('SagasService', () => {
  let http: HttpTestingController;
  let service: SagasService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(SagasService);
  });

  afterEach(() => http.verify());

  it('lists sagas with deterministic pagination defaults and no name filter', () => {
    const next = vi.fn();
    service.getSagas().subscribe(next);
    const request = http.expectOne((candidate) => candidate.url === '/api/sagas');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    expect(request.request.params.get('sortBy')).toBe('name');
    expect(request.request.params.get('direction')).toBe('ASC');
    expect(request.request.params.has('name')).toBe(false);
    const page = testSagaPage();
    request.flush(page);
    expect(next).toHaveBeenCalledWith(page);
  });

  it('sends page, size, sort and a trimmed name filter', () => {
    service
      .getSagas({
        page: 2,
        size: 10,
        sortBy: 'createdAt',
        direction: 'DESC',
        name: '  bruma  ',
      })
      .subscribe();
    const request = http.expectOne((candidate) => candidate.url === '/api/sagas');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.get('sortBy')).toBe('createdAt');
    expect(request.request.params.get('direction')).toBe('DESC');
    expect(request.request.params.get('name')).toBe('bruma');
  });

  it('gets, creates, updates and deletes with the exact contracts', () => {
    const saga = testSaga({ id: 42 });
    service.getSaga(42).subscribe();
    http.expectOne('/api/sagas/42').flush(saga);

    const request = testSagaRequest({
      name: 'Nueva saga',
      author: 'Autora',
      description: 'Descripción',
      imageUrl: 'https://example.test/saga.jpg',
    });
    service.createSaga(request).subscribe();
    const create = http.expectOne(
      (candidate) => candidate.url === '/api/sagas' && candidate.method === 'POST',
    );
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(request);
    create.flush(saga);

    service.updateSaga(42, request, '7').subscribe();
    const update = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'PUT',
    );
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(request);
    expect(update.request.params.keys()).toEqual(['expectedRevision']);
    expect(update.request.params.get('expectedRevision')).toBe('7');
    update.flush(saga);

    service.deleteSaga(42, '9007199254740993').subscribe();
    const deletion = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'DELETE',
    );
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.params.get('expectedRevision')).toBe('9007199254740993');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('gets the sagas of a book without changing the book contract', () => {
    const memberships = [
      { sagaId: 4, sagaName: 'Nacidos de la bruma', volumeId: 18, position: 3, volumeLabel: '3' },
    ];
    service.getBookSagas(42).subscribe();
    const request = http.expectOne('/api/books/42/sagas');
    expect(request.request.method).toBe('GET');
    request.flush(memberships);
  });

  it('propagates ProblemDetail errors unchanged', () => {
    const error = vi.fn();
    service.getSaga(42).subscribe({ error });
    http
      .expectOne('/api/sagas/42')
      .flush({ code: 'SAGA_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(error.mock.calls[0][0].status).toBe(404);
    expect(error.mock.calls[0][0].error.code).toBe('SAGA_NOT_FOUND');
  });

  it('gets ordered volumes with their revision and progress', () => {
    const response = testSagaVolumes();
    service.getVolumes(42).subscribe();
    const request = http.expectOne('/api/sagas/42/volumes');
    expect(request.request.method).toBe('GET');
    request.flush(response);
  });

  it('adds linked and pending volumes with exact bodies', () => {
    service
      .addVolume(42, {
        bookId: 10,
        pendingTitle: null,
        volumeLabel: '1',
        expectedRevision: '3',
      })
      .subscribe();
    const linked = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42/volumes' && candidate.method === 'POST',
    );
    expect(linked.request.body).toEqual({
      bookId: 10,
      pendingTitle: null,
      volumeLabel: '1',
      expectedRevision: '3',
    });
    linked.flush({ revision: '4', volume: testSagaVolume() });

    service
      .addVolume(42, {
        bookId: null,
        pendingTitle: 'Pendiente',
        volumeLabel: null,
        expectedRevision: '4',
      })
      .subscribe();
    const pending = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42/volumes' && candidate.method === 'POST',
    );
    expect(pending.request.body).toEqual({
      bookId: null,
      pendingTitle: 'Pendiente',
      volumeLabel: null,
      expectedRevision: '4',
    });
    pending.flush({ revision: '5', volume: testPendingSagaVolume() });
  });

  it('updates, moves, links, unlinks and deletes volumes with expectedRevision', () => {
    service
      .updateVolume(42, 100, {
        pendingTitle: null,
        volumeLabel: '2',
        expectedRevision: '5',
      })
      .subscribe();
    const update = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42/volumes/100' && candidate.method === 'PUT',
    );
    expect(update.request.body).toEqual({
      pendingTitle: null,
      volumeLabel: '2',
      expectedRevision: '5',
    });
    update.flush({ revision: '6', volume: testSagaVolume() });

    service.moveVolume(42, 100, { toPosition: 2, expectedRevision: '6' }).subscribe();
    const move = http.expectOne(
      (candidate) =>
        candidate.url === '/api/sagas/42/volumes/100/move' && candidate.method === 'POST',
    );
    expect(move.request.body).toEqual({ toPosition: 2, expectedRevision: '6' });
    move.flush({ revision: '7', volumeId: 100, position: 2 });

    service.linkVolume(42, 200, { bookId: 10, expectedRevision: '7' }).subscribe();
    const link = http.expectOne(
      (candidate) =>
        candidate.url === '/api/sagas/42/volumes/200/link' && candidate.method === 'POST',
    );
    expect(link.request.body).toEqual({ bookId: 10, expectedRevision: '7' });
    link.flush({ revision: '8', volume: testSagaVolume() });

    service.unlinkVolume(42, 100, { pendingTitle: null, expectedRevision: '8' }).subscribe();
    const unlink = http.expectOne(
      (candidate) =>
        candidate.url === '/api/sagas/42/volumes/100/unlink' && candidate.method === 'POST',
    );
    expect(unlink.request.body).toEqual({ pendingTitle: null, expectedRevision: '8' });
    unlink.flush({ revision: '9', volume: testPendingSagaVolume() });

    service.deleteVolume(42, 100, '9').subscribe();
    const deletion = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42/volumes/100' && candidate.method === 'DELETE',
    );
    expect(deletion.request.params.get('expectedRevision')).toBe('9');
    deletion.flush({ revision: '10' });
  });
});
