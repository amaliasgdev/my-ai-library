import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { testSaga } from '../../models/saga.testing';
import { SagaEdit } from './saga-edit';

describe('SagaEdit', () => {
  let fixture: ComponentFixture<SagaEdit>;
  let page: SagaEdit;
  let element: HTMLElement;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ id: '42' }));
    TestBed.configureTestingModule({
      imports: [SagaEdit],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
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
    fixture = TestBed.createComponent(SagaEdit);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function load(overrides = {}) {
    const saga = testSaga({ id: 42, ...overrides });
    http.expectOne('/api/sagas/42').flush(saga);
    fixture.detectChanges();
    return saga;
  }

  it('loads the route id and preloads the form', () => {
    expect(page.state().status).toBe('loading');
    load({ name: 'Saga cargada', author: 'Autora', revision: '3' });
    expect(page.state().status).toBe('loaded');
    expect(page.editor().form.controls.name.value).toBe('Saga cargada');
    expect(page.editor().form.controls.author.value).toBe('Autora');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Editar saga');
  });

  it.each(['0', '-1', 'new', 'abc', ' 42', '4.2', '9007199254740992', ''])(
    'rejects invalid id %s without a request or retry',
    (id) => {
      const previous = http.expectOne('/api/sagas/42');
      params.next(convertToParamMap({ id }));
      fixture.detectChanges();
      expect(previous.cancelled).toBe(true);
      expect(element.querySelector('[role="alert"]')?.textContent).toBe(
        'El identificador de la saga no es válido',
      );
      expect(element.textContent).not.toContain('Reintentar');
      http.expectNone((request) => request.url.startsWith('/api/sagas/'));
    },
  );

  it('shows a load error and retries only the GET', () => {
    http
      .expectOne('/api/sagas/42')
      .flush({ detail: 'SECRET' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(page.state()).toEqual({
      status: 'error',
      message: 'El servidor no pudo cargar la saga',
    });
    page.retry();
    http.expectOne('/api/sagas/42').flush(testSaga({ id: 42 }));
    fixture.detectChanges();
    expect(page.state().status).toBe('loaded');
  });

  it('updates with expectedRevision and returns to the detail', () => {
    load({ revision: '4' });
    page.editor().form.controls.name.setValue('  Saga editada  ');
    page.editor().submit();
    const request = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'PUT',
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.params.get('expectedRevision')).toBe('4');
    expect(request.request.body).toEqual({
      name: 'Saga editada',
      author: 'Autora de prueba',
      description: 'Descripción de la saga',
      imageUrl: null,
    });
    request.flush(testSaga({ id: 42, name: 'Saga editada', revision: '5' }));
    expect(navigate).toHaveBeenCalledWith(['/sagas', 42]);
  });

  it('applies 400 field errors', () => {
    load();
    page.editor().form.controls.name.setValue('Saga');
    page.editor().submit();
    http
      .expectOne((candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'PUT')
      .flush(
        { title: 'Validation error', errors: { name: 'must not be blank' } },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(page.editor().form.controls.name.hasError('server')).toBe(true);
    expect(page.generalError()).toBe('Revisa los campos indicados');
  });

  it('marks the name field when the backend reports a duplicate', () => {
    load();
    page.editor().form.controls.name.setValue('Duplicada');
    page.editor().submit();
    http
      .expectOne((candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'PUT')
      .flush({ code: 'SAGA_NAME_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(page.editor().form.controls.name.hasError('server')).toBe(true);
    http.expectNone((request) => request.url === '/api/sagas/42' && request.method === 'GET');
  });

  it('reloads the latest revision after a 409 before allowing another save', () => {
    load({ name: 'Original', revision: '0' });
    page.editor().form.controls.name.setValue('Intento');
    page.editor().submit();
    http
      .expectOne((candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'PUT')
      .flush({ code: 'SAGA_REVISION_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    expect(page.generalError()).toContain('La saga ha cambiado');
    const reload = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'GET',
    );
    expect(reload.request.method).toBe('GET');
    reload.flush(testSaga({ id: 42, name: 'Actualizada por otro cliente', revision: '1' }));
    fixture.detectChanges();
    expect(page.state().status).toBe('loaded');
    expect(page.editor().form.controls.name.value).toBe('Actualizada por otro cliente');
    expect(page.generalError()).toContain('La saga ha cambiado');
    page.editor().submit();
    const retry = http.expectOne(
      (candidate) => candidate.url === '/api/sagas/42' && candidate.method === 'PUT',
    );
    expect(retry.request.params.get('expectedRevision')).toBe('1');
    retry.flush(testSaga({ id: 42, revision: '2' }));
  });

  it('cancels to the detail when loaded and to the list after an error', () => {
    load();
    page.cancel();
    expect(navigate).toHaveBeenCalledWith(['/sagas', 42]);

    navigate.mockClear();
    params.next(convertToParamMap({ id: 'bad' }));
    fixture.detectChanges();
    page.cancel();
    expect(navigate).toHaveBeenCalledWith(['/sagas']);
    http.expectNone((request) => request.url.startsWith('/api/sagas/'));
  });
});
