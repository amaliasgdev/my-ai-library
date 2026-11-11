import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BookForm } from '../book-form/book-form';
import { emptyPhotoDraft } from '../../pages/book-photo-import/photo-import-workflow';
import { PhotoImportReviewDialog } from './photo-import-review-dialog';

describe('PhotoImportReviewDialog uses the existing CRUD form', () => {
  function create() {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [PhotoImportReviewDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { ...emptyPhotoDraft(), title: 'Actual book', author: 'Actual author' },
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(PhotoImportReviewDialog);
    fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(BookForm)).componentInstance as BookForm;
    return { fixture, form, close, dialog: fixture.componentInstance };
  }
  it('does not require a genre and never invents a placeholder genre', () => {
    const { fixture, form, close, dialog } = create();
    dialog.realConfirmed.set(true);
    fixture.detectChanges();
    expect(form.form.controls.genres.value).toEqual([]);
    expect(form.form.controls.genres.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('#genre-search[required]')).toBeNull();
    expect(fixture.nativeElement.querySelector('#genre-search')).not.toBeNull();
    form.submit();
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.calls[0][0].genres).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Sin género');
  });

  it('discards genre selection changes when the photo review is cancelled', () => {
    const { form, close } = create();
    form.form.controls.genres.setValue(['Aventura']);
    form.cancel();
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.calls[0]).toHaveLength(0);
    expect(form.form.controls.genres.value).toEqual(['Aventura']);
  });
  it('requires explicit real-data confirmation, supports null ISBN, and never writes', () => {
    const { fixture, form, close, dialog } = create();
    form.submit();
    expect(close).not.toHaveBeenCalled();
    dialog.realConfirmed.set(true);
    fixture.detectChanges();
    form.submit();
    form.submit();
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.calls[0][0].isbn).toBeNull();
    expect(form.lookupEnabled()).toBe(false);
    expect(form.scanEnabled()).toBe(false);
    expect(form.isbnReadonly()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('simulado');
  });
  it('preserves all manually edited CRUD data and never turns the photo into a cover', () => {
    const { fixture, form, close, dialog } = create();
    dialog.realConfirmed.set(true);
    fixture.detectChanges();
    form.form.patchValue({
      description: 'Real description',
      publisher: 'Publisher',
      publicationYear: 2001,
      language: 'es',
      coverUrl: 'https://example.org/bibliography.jpg',
    });
    form.form.controls.genres.setValue(['Fiction']);
    form.submit();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Real description',
        publisher: 'Publisher',
        publicationYear: 2001,
        language: 'es',
        genres: ['Fiction'],
        coverUrl: 'https://example.org/bibliography.jpg',
      }),
    );
  });
  it('uses unchanged validation for author, year, ISBN and cover URL', () => {
    const { fixture, form, close, dialog } = create();
    dialog.realConfirmed.set(true);
    fixture.detectChanges();
    for (const patch of [
      { author: '' },
      { publicationYear: 2101 },
      { isbn: 'invalid' },
      { coverUrl: 'blob:local-photo' },
    ]) {
      form.form.patchValue({
        author: 'Author',
        publicationYear: null,
        isbn: '',
        coverUrl: '',
        ...patch,
      });
      form.submit();
      expect(close).not.toHaveBeenCalled();
    }
  });
});
