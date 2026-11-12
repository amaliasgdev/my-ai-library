import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookForm } from './book-form';
import { testBook, testBookLookup, testBookRequest } from '../../models/book.testing';

describe('BookForm without HTTP or routing providers', () => {
  let fixture: ComponentFixture<BookForm>;
  let component: BookForm;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BookForm] });
    fixture = TestBed.createComponent(BookForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('uses outline fields and gives ISBN lookup its own full-width panel', () => {
    fixture.componentRef.setInput('lookupEnabled', true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const fields = [...element.querySelectorAll('mat-form-field')];
    expect(fields.length).toBeGreaterThan(0);
    expect(
      fields.every((field) => field.classList.contains('mat-form-field-appearance-outline')),
    ).toBe(true);
    const lookup = element.querySelector('.isbn-lookup');
    expect(lookup?.classList).toContain('full-width');
    expect(lookup?.querySelectorAll('app-inline-feedback').length).toBeGreaterThan(0);
  });

  it('should synchronize only coverUrl without clearing other values or control states', () => {
    component.form.patchValue({ title: 'Draft', description: 'Exact', pageCount: 100 });
    component.form.controls.title.markAsDirty();
    component.form.controls.title.markAsTouched();
    component.form.controls.genres.setValue(['Pendiente']);
    component.synchronizeCoverUrl('https://images.example.test/new.png');
    expect(component.form.controls.title.value).toBe('Draft');
    expect(component.form.controls.title.dirty).toBe(true);
    expect(component.form.controls.title.touched).toBe(true);
    expect(component.form.controls.genres.value).toEqual(['Pendiente']);
    component.synchronizeCoverUrl(null);
    expect(component.form.controls.coverUrl.value).toBe('');
    expect(component.form.controls.description.value).toBe('Exact');
  });

  it('should block only save during a synchronization error, while leaving cancel available', () => {
    fixture.componentRef.setInput('saveDisabled', true);
    fixture.detectChanges();
    component.form.patchValue({ title: 'Valid', author: 'Author' });
    const save = vi.fn();
    const cancel = vi.fn();
    component.save.subscribe(save);
    component.cancelled.subscribe(cancel);
    component.submit();
    component.cancel();
    expect(save).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('should keep lookup disabled by default, including its states and errors', () => {
    fixture.componentRef.setInput('lookupLoading', true);
    fixture.componentRef.setInput('lookupError', 'Hidden lookup error');
    fixture.detectChanges();
    const requested = vi.fn();
    component.lookupRequested.subscribe(requested);
    component.form.controls.isbn.setValue('9780132350884');
    component.requestLookup();
    expect(requested).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.isbn-lookup')).toBeNull();
  });

  it('keeps scanner disabled by default and emits only an optional UI action', () => {
    fixture.componentRef.setInput('lookupEnabled', true);
    fixture.detectChanges();
    expect(component.scanEnabled()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Escanear ISBN');
    fixture.componentRef.setInput('scanEnabled', true);
    fixture.detectChanges();
    const requested = vi.fn();
    component.scanRequested.subscribe(requested);
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const button = buttons.find((button) => button.textContent?.trim() === 'Escanear ISBN')!;
    button.click();
    expect(requested).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });

  it('should emit lookup intent without HTTP providers and ignore POST-specific server errors', () => {
    fixture.componentRef.setInput('lookupEnabled', true);
    component.form.controls.isbn.setValue('978-0132350884');
    component.markIsbnConflict();
    fixture.detectChanges();
    const requested = vi.fn();
    component.lookupRequested.subscribe(requested);
    component.requestLookup();
    expect(requested).toHaveBeenCalledExactlyOnceWith('978-0132350884');
  });

  it('should apply lookup genres only when the selection is empty', () => {
    component.applyLookup(testBookLookup({ genres: ['Novela negra', 'Terror'] }));
    expect(component.form.controls.genres.value).toEqual(['Novela negra', 'Terror']);
    expect(component.form.controls.genres.dirty).toBe(true);
    component.applyLookup(testBookLookup({ genres: ['Poesía'] }));
    expect(component.form.controls.genres.value).toEqual(['Novela negra', 'Terror']);
    component.form.controls.genres.reset([]);
    expect(component.form.controls.genres.pristine).toBe(true);
  });

  it('should surface lookup genres that violate the shared contract instead of repairing them', () => {
    component.applyLookup(
      testBookLookup({ genres: [...Array.from({ length: 11 }, (_, i) => `Género ${i}`)] }),
    );
    expect(component.form.controls.genres.hasError('genreLimit')).toBe(true);
    expect(component.form.controls.genres.untouched).toBe(true);
    component.form.controls.genres.reset([]);
    component.applyLookup(testBookLookup({ genres: ['Fantasía', 'fantasía'] }));
    expect(component.form.controls.genres.hasError('duplicate')).toBe(true);
  });

  it('should emit a valid full request including the confirmed genres', () => {
    const save = vi.fn();
    component.save.subscribe(save);
    component.form.patchValue({ title: 'Libro de prueba', author: 'Autora de prueba' });
    component.form.controls.genres.setValue([' Aventura ']);
    component.submit();
    expect(save).toHaveBeenCalledWith(testBookRequest({ genres: ['Aventura'] }));
  });

  it('should never save an invalid genre list and focus the genre search input', () => {
    const save = vi.fn();
    component.save.subscribe(save);
    component.form.patchValue({ title: 'Libro', author: 'Autora' });
    component.form.controls.genres.setValue(Array.from({ length: 11 }, (_, i) => `Género ${i}`));
    component.submit();
    expect(save).not.toHaveBeenCalled();
    expect(component.form.controls.genres.touched).toBe(true);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#genre-search'));
  });

  it('should save without genres and never invent a placeholder genre', () => {
    const save = vi.fn();
    component.save.subscribe(save);
    component.form.patchValue({ title: 'Libro', author: 'Autora' });
    component.submit();
    expect(save).toHaveBeenCalledWith(testBookRequest({ title: 'Libro', author: 'Autora' }));
    expect(fixture.nativeElement.textContent).not.toContain('Sin género');
  });

  it('should preload a pristine untouched form keeping existing genres', () => {
    fixture.componentRef.setInput(
      'initialBook',
      testBook({ genres: ['Aventura'], pageCount: 120 }),
    );
    fixture.detectChanges();
    expect(component.form.pristine).toBe(true);
    expect(component.form.untouched).toBe(true);
    expect(component.form.controls.genres.value).toEqual(['Aventura']);
    expect(fixture.nativeElement.textContent).toContain('Aventura');
    component.form.controls.title.setValue('Edited title');
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    expect(component.form.controls.title.value).toBe('Edited title');
  });

  it('should block every action while submitting, including the genre selector', () => {
    fixture.componentRef.setInput('initialBook', testBook({ genres: ['Aventura'] }));
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    const save = vi.fn();
    const cancelled = vi.fn();
    component.save.subscribe(save);
    component.cancelled.subscribe(cancelled);
    component.submit();
    component.cancel();
    expect(save).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
    expect(component.form.controls.genres.value).toEqual(['Aventura']);
    expect(fixture.nativeElement.querySelector('#genre-search')?.hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Eliminar género Aventura"]'),
    ).toHaveProperty('disabled', true);
  });

  it('should apply safe server field errors and preserve local errors until edited', () => {
    component.applyFieldErrors({ errors: { title: 'SECRET', unknown: 'SECRET' } });
    expect(component.form.controls.title.errors).toEqual({ required: true, server: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('SECRET');
    component.form.controls.title.setValue(' ');
    expect(component.form.controls.title.errors).toEqual({ required: true });
  });

  it('should map genres and genres[index] server errors onto the genres control', () => {
    component.applyFieldErrors({ errors: { 'genres[0]': 'SECRET' } });
    expect(component.form.controls.genres.hasError('server')).toBe(true);
    component.form.controls.genres.setValue(['Fantasía']);
    expect(component.form.controls.genres.errors).toBeNull();
    component.applyFieldErrors({ errors: { genres: 'SECRET' } });
    expect(component.form.controls.genres.hasError('server')).toBe(true);
  });

  it('should mark ISBN conflict and clear it when ISBN is changed', () => {
    component.markIsbnConflict();
    expect(component.form.controls.isbn.hasError('server')).toBe(true);
    component.form.controls.isbn.setValue('1234567890');
    expect(component.form.controls.isbn.errors).toBeNull();
  });

  it('should emit cancellation without knowing a destination', () => {
    const cancelled = vi.fn();
    component.cancelled.subscribe(cancelled);
    component.cancel();
    expect(cancelled).toHaveBeenCalledOnce();
  });
});
