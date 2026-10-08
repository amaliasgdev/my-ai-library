import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookForm } from './book-form';
import { testBook, testBookRequest } from '../../models/book.testing';

describe('BookForm without HTTP or routing providers', () => {
  let fixture: ComponentFixture<BookForm>;
  let component: BookForm;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BookForm] });
    fixture = TestBed.createComponent(BookForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should emit only a valid full request after processing pending genres', () => {
    const save = vi.fn();
    component.save.subscribe(save);
    component.submit();
    expect(save).not.toHaveBeenCalled();
    expect(component.form.controls.title.touched).toBe(true);
    component.form.patchValue({ title: 'Libro de prueba', author: 'Autora de prueba' });
    component.genreInput.setValue(' Aventura ');
    component.submit();
    expect(save).toHaveBeenCalledWith(testBookRequest({ genres: ['Aventura'] }));
  });

  it('should never discard an invalid pending genre', () => {
    const save = vi.fn();
    component.save.subscribe(save);
    component.form.patchValue({ title: 'Libro', author: 'Autora' });
    component.genreInput.setValue('x'.repeat(51));
    component.submit();
    expect(save).not.toHaveBeenCalled();
    expect(component.genreInput.value).toHaveLength(51);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#genre-input'));
  });

  it('should preload a pristine untouched form and not reset user edits when submitting changes', () => {
    fixture.componentRef.setInput(
      'initialBook',
      testBook({ genres: ['Aventura'], pageCount: 120 }),
    );
    fixture.detectChanges();
    expect(component.form.pristine).toBe(true);
    expect(component.form.untouched).toBe(true);
    expect(component.form.controls.genres.value).toEqual(['Aventura']);
    component.form.controls.title.setValue('Edited title');
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    expect(component.form.controls.title.value).toBe('Edited title');
  });

  it('should block every action while submitting', () => {
    fixture.componentRef.setInput('initialBook', testBook({ genres: ['Aventura'] }));
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    const save = vi.fn();
    const cancelled = vi.fn();
    component.save.subscribe(save);
    component.cancelled.subscribe(cancelled);
    component.submit();
    component.cancel();
    component.removeGenre(0);
    expect(component.addGenre()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
    expect(component.form.controls.genres.value).toEqual(['Aventura']);
  });

  it('should apply safe server field errors and preserve local errors until edited', () => {
    component.applyFieldErrors({ errors: { title: 'SECRET', unknown: 'SECRET' } });
    expect(component.form.controls.title.errors).toEqual({ required: true, server: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('SECRET');
    component.form.controls.title.setValue(' ');
    expect(component.form.controls.title.errors).toEqual({ required: true });
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
