import { ComponentFixture, TestBed } from '@angular/core/testing';
import { testSaga } from '../../models/saga.testing';
import { SagaForm } from './saga-form';

describe('SagaForm', () => {
  let fixture: ComponentFixture<SagaForm>;
  let page: SagaForm;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SagaForm] });
    fixture = TestBed.createComponent(SagaForm);
    page = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('starts empty and requires a nonblank name', () => {
    expect(page.form.invalid).toBe(true);
    for (const value of ['', ' ', '\n\t']) {
      page.form.controls.name.setValue(value);
      expect(page.form.controls.name.hasError('required')).toBe(true);
    }
    page.form.controls.name.setValue('x'.repeat(256));
    expect(page.form.controls.name.hasError('maxlength')).toBe(true);
    page.form.controls.name.setValue('Saga');
    expect(page.form.valid).toBe(true);
  });

  it('enforces backend length limits for optional fields', () => {
    page.form.controls.name.setValue('Saga');
    page.form.controls.author.setValue('a'.repeat(256));
    expect(page.form.controls.author.hasError('maxlength')).toBe(true);
    page.form.controls.author.setValue('');
    page.form.controls.description.setValue('d'.repeat(5001));
    expect(page.form.controls.description.hasError('maxlength')).toBe(true);
    page.form.controls.description.setValue('');
    page.form.controls.imageUrl.setValue('h'.repeat(2049));
    expect(page.form.controls.imageUrl.hasError('maxlength')).toBe(true);
  });

  it('accepts only HTTP/HTTPS image URLs without spaces or credentials', () => {
    page.form.controls.name.setValue('Saga');
    for (const value of [
      'ftp://example.test/a.jpg',
      'not a url',
      'https://exa mple.test/a.jpg',
      'https://user@example.test/a.jpg',
    ]) {
      page.form.controls.imageUrl.setValue(value);
      expect(page.form.controls.imageUrl.hasError('imageUrl')).toBe(true);
    }
    page.form.controls.imageUrl.setValue('https://example.test/a.jpg');
    expect(page.form.controls.imageUrl.valid).toBe(true);
  });

  it('marks fields touched, focuses the first invalid field and does not emit', () => {
    const save = vi.fn();
    page.save.subscribe(save);
    page.submit();
    fixture.detectChanges();
    expect(page.form.controls.name.touched).toBe(true);
    expect(document.activeElement).toBe(element.querySelector('[formControlName="name"]'));
    expect(save).not.toHaveBeenCalled();
  });

  it('emits a normalized request', () => {
    const save = vi.fn();
    page.save.subscribe(save);
    page.form.patchValue({
      name: '  Saga  ',
      author: '  Autora  ',
      description: '  Descripción  ',
      imageUrl: 'https://example.test/saga.jpg',
    });
    page.submit();
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({
      name: 'Saga',
      author: 'Autora',
      description: 'Descripción',
      imageUrl: 'https://example.test/saga.jpg',
    });
  });

  it('preloads an existing saga and clears server errors on edit', () => {
    fixture.componentRef.setInput(
      'initialSaga',
      testSaga({
        name: 'Saga existente',
        author: 'Autora',
        description: 'Descripción',
        imageUrl: 'https://example.test/saga.jpg',
      }),
    );
    fixture.detectChanges();
    expect(page.form.getRawValue()).toEqual({
      name: 'Saga existente',
      author: 'Autora',
      description: 'Descripción',
      imageUrl: 'https://example.test/saga.jpg',
    });
    page.applyFieldErrors({ errors: { name: 'Duplicada', imageUrl: 'Inválida' } });
    expect(page.form.controls.name.hasError('server')).toBe(true);
    expect(page.form.controls.imageUrl.hasError('server')).toBe(true);
    page.form.controls.name.setValue('Saga cambiada');
    expect(page.form.controls.name.hasError('server')).toBe(false);
  });

  it('marks a name conflict with an explicit Spanish message', () => {
    page.form.controls.name.setValue('Saga');
    page.markNameConflict();
    fixture.detectChanges();
    expect(page.fieldError(page.form.controls.name)).toBe(
      'Ya existe una saga con ese nombre y autor',
    );
  });

  it('blocks submission and cancellation while submitting', () => {
    const save = vi.fn();
    const cancel = vi.fn();
    page.save.subscribe(save);
    page.cancelled.subscribe(cancel);
    page.form.controls.name.setValue('Saga');
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    page.submit();
    page.cancel();
    expect(save).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });
});
