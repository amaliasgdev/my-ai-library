import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { testSaga } from '../../models/saga.testing';
import { SagaCreate } from './saga-create';

describe('SagaCreate', () => {
  let fixture: ComponentFixture<SagaCreate>;
  let page: SagaCreate;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SagaCreate],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(SagaCreate);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function fillValid(): void {
    page.editor().form.patchValue({
      name: '  Nacidos de la bruma  ',
      author: '  Brandon Sanderson  ',
      description: 'Fantasía',
      imageUrl: 'https://example.test/mistborn.jpg',
    });
  }

  it('shows the heading and starts with no request', () => {
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Crear saga');
    expect(page.submitting()).toBe(false);
    http.expectNone('/api/sagas');
  });

  it('posts a normalized request and navigates to the new saga', () => {
    fillValid();
    page.editor().submit();
    const request = http.expectOne('/api/sagas');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Nacidos de la bruma',
      author: 'Brandon Sanderson',
      description: 'Fantasía',
      imageUrl: 'https://example.test/mistborn.jpg',
    });
    request.flush(testSaga({ id: 9 }), { status: 201, statusText: 'Created' });
    expect(page.submitting()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/sagas', 9]);
  });

  it('applies server field errors and keeps the user on the page after 400', () => {
    fillValid();
    page.editor().submit();
    http
      .expectOne('/api/sagas')
      .flush(
        { title: 'Validation error', errors: { name: 'must not be blank' } },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();
    expect(page.generalError()).toBe('Revisa los campos indicados');
    expect(page.editor().form.controls.name.hasError('server')).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('marks the name field on a duplicate name conflict', () => {
    fillValid();
    page.editor().submit();
    http
      .expectOne('/api/sagas')
      .flush(
        { code: 'SAGA_NAME_CONFLICT', errors: { name: 'already exists' } },
        { status: 409, statusText: 'Conflict' },
      );
    expect(page.generalError()).toBe('Ya existe una saga con ese nombre y autor');
    expect(page.editor().form.controls.name.hasError('server')).toBe(true);
  });

  it('does not submit twice while the first request is pending', () => {
    fillValid();
    page.editor().submit();
    page.editor().submit();
    const request = http.expectOne('/api/sagas');
    request.flush(testSaga({ id: 9 }), { status: 201, statusText: 'Created' });
  });

  it('cancels to the saga list without writing', () => {
    page.cancel();
    expect(navigate).toHaveBeenCalledWith(['/sagas']);
    http.expectNone('/api/sagas');
  });
});
