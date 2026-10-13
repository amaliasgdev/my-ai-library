import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BookForm } from '../book-form/book-form';
import { importDraft } from '../../models/bulk-isbn-import';
import { testBookLookup } from '../../models/book.testing';
import { BookImportReviewDialog } from './book-import-review-dialog';

describe('BookImportReviewDialog without HTTP or routing', () => {
  function create(partial = false) {
    const draft = partial
      ? importDraft('9780306406157')
      : importDraft('9780306406157', testBookLookup());
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [BookImportReviewDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: draft },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(BookImportReviewDialog);
    fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(BookForm)).componentInstance as BookForm;
    return { fixture, form, close, draft };
  }
  it('preloads a draft, locks ISBN and exposes only confirmation, not lookup/scanner', () => {
    const { fixture, form } = create();
    expect(form.form.controls.title.value).toBe('Clean Code');
    expect(form.form.controls.isbn.value).toBe('9780306406157');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector<HTMLInputElement>('[formControlName="isbn"]')!.readOnly).toBe(true);
    expect(root.textContent).toContain('Confirmar datos');
    expect(root.textContent).not.toContain('Buscar por ISBN');
    expect(root.textContent).not.toContain('Escanear ISBN');
    expect(form.lookupEnabled()).toBe(false);
    expect(form.scanEnabled()).toBe(false);
  });
  it('confirm returns validated BookRequest only and guards duplicate closes', () => {
    const { fixture, form, close } = create();
    form.submit();
    form.submit();
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.calls[0][0]).toMatchObject({
      isbn: '9780306406157',
      title: 'Clean Code',
      author: 'Robert C. Martin',
      description: null,
    });
    expect(Object.keys(close.mock.calls[0][0])).toHaveLength(10);
    fixture.destroy();
  });
  it('partial/no metadata requires manual title/author before confirmation', () => {
    const { form, close } = create(true);
    form.submit();
    expect(close).not.toHaveBeenCalled();
    expect(form.form.touched).toBe(true);
    form.form.patchValue({ title: 'Manual title', author: 'Manual author' });
    form.submit();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Manual title',
        author: 'Manual author',
        isbn: '9780306406157',
      }),
    );
  });
  it('cancel returns no request and leaves the supplied draft untouched', () => {
    const { fixture, form, draft, close } = create();
    form.form.controls.title.setValue('Changed');
    form.cancel();
    expect(close).toHaveBeenCalledWith();
    expect(draft.title).toBe('Clean Code');
    fixture.destroy();
  });
  it('rejects a programmatically changed ISBN even if CRUD form would accept it', () => {
    const { form, close } = create();
    form.form.controls.isbn.setValue('9788411014090');
    form.submit();
    expect(close).not.toHaveBeenCalled();
  });
});
