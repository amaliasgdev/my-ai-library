import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { testSaga, testSagaProgress } from '../../models/saga.testing';
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
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
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

  function load(overrides = {}) {
    const saga = testSaga({ id: 42, ...overrides });
    http.expectOne('/api/sagas/42').flush(saga);
    fixture.detectChanges();
    return saga;
  }

  async function confirmDelete() {
    page.openDeleteDialog();
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Eliminar saga' }))).click();
    await vi.waitFor(() => expect(page.deleting()).toBe(true));
    return http.expectOne(
      (request) => request.url === '/api/sagas/42' && request.method === 'DELETE',
    );
  }

  it('announces loading and requests the exact id', () => {
    expect(page.state().status).toBe('loading');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Cargando saga');
    http.expectOne('/api/sagas/42').flush(testSaga({ id: 42 }));
  });

  it.each(['0', '-1', 'new', 'abc', ' 42', '4.2', '9007199254740992', ''])(
    'rejects invalid id %s without requesting or retrying',
    (id) => {
      const previous = http.expectOne('/api/sagas/42');
      params.next(convertToParamMap({ id }));
      fixture.detectChanges();
      expect(previous.cancelled).toBe(true);
      expect(element.querySelector('[role="alert"]')?.textContent).toBe(
        'El identificador de la saga no es válido',
      );
      expect(element.textContent).not.toContain('Reintentar');
      page.retry();
      http.expectNone((request) => request.url.startsWith('/api/sagas/'));
    },
  );

  it('shows load errors and retries only the GET', () => {
    http
      .expectOne('/api/sagas/42')
      .flush({ detail: 'SECRET' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(page.state()).toEqual({ status: 'error', message: 'La saga no existe' });
    page.retry();
    http.expectOne('/api/sagas/42').flush(testSaga({ id: 42 }));
    fixture.detectChanges();
    expect(page.state().status).toBe('loaded');
  });

  it('renders the basic data and both progress indicators with explicit text', () => {
    load({
      name: 'Nacidos de la bruma',
      author: 'Brandon Sanderson',
      description: 'Fantasía ambientada en Scadrial',
      progress: testSagaProgress({
        total: 5,
        linked: 3,
        pending: 2,
        read: 1,
        reading: 1,
        toRead: 1,
        abandoned: 0,
      }),
    });

    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Nacidos de la bruma');
    expect(element.textContent).toContain('Brandon Sanderson');
    expect(element.textContent).toContain('Fantasía ambientada en Scadrial');
    expect(element.textContent).toContain('5');
    expect(element.textContent).toContain('3 de 5 volúmenes en la biblioteca');
    expect(element.textContent).toContain('1 de 5 volúmenes leídos');
    expect(element.textContent).toContain('60%');
    expect(element.textContent).toContain('20%');
    expect(element.querySelectorAll('mat-progress-bar')).toHaveLength(2);
    expect(element.querySelector('#saga-volumes-heading')).not.toBeNull();
    expect(
      element.querySelector('section[aria-labelledby="saga-volumes-heading"] button'),
    ).toBeNull();
  });

  it('handles an empty saga without failing percentages', () => {
    load({
      progress: testSagaProgress({
        total: 0,
        linked: 0,
        pending: 0,
        read: 0,
        reading: 0,
        toRead: 0,
        abandoned: 0,
      }),
      description: null,
    });
    expect(element.textContent).toContain('Esta saga todavía no tiene volúmenes.');
    expect(element.textContent).toContain('0 de 0 volúmenes en la biblioteca');
    expect(element.textContent).toContain('Sin descripción');
    expect(element.textContent).not.toContain('NaN');
  });

  it('does not delete when the confirmation is cancelled', async () => {
    load();
    page.openDeleteDialog();
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (await loader.getHarness(MatDialogHarness)).close();
    await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    http.expectNone((request) => request.method === 'DELETE');
  });

  it('deletes only after confirmation with the current revision', async () => {
    load({ revision: '6' });
    const deletion = await confirmDelete();
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.params.get('expectedRevision')).toBe('6');
    expect(page.deleting()).toBe(true);
    expect(element.querySelector<HTMLButtonElement>('button[aria-label], button')?.disabled).toBe(
      true,
    );
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    expect(navigate).toHaveBeenCalledWith(['/sagas']);
  });

  it('reloads the current saga after a 409 and allows a new explicit attempt', async () => {
    load({ revision: '0' });
    const first = await confirmDelete();
    first.flush({ code: 'SAGA_REVISION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(page.deleteError()).toContain('La saga ha cambiado');
    const reload = http.expectOne('/api/sagas/42');
    expect(reload.request.method).toBe('GET');
    reload.flush(testSaga({ id: 42, revision: '1' }));
    fixture.detectChanges();
    expect(page.state().status).toBe('loaded');

    const second = await confirmDelete();
    expect(second.request.params.get('expectedRevision')).toBe('1');
    second.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('falls back to a placeholder when the image fails', () => {
    load({ imageUrl: 'https://example.test/broken.jpg' });
    const image = element.querySelector('img')!;
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('Sin imagen');
  });
});
