import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BookForm } from '../book-form/book-form';
import { BookFormValue } from '../book-form/book-form.helpers';
import { BookRequest } from '../../models/book.models';

@Component({
  selector: 'app-book-import-review-dialog',
  imports: [MatDialogModule, BookForm],
  template: `
    <h2 mat-dialog-title>Revisar libro</h2>
    <mat-dialog-content>
      <p>Confirma los datos para preparar esta fila. No se guardará todavía.</p>
      <app-book-form
        [initialDraft]="draft"
        [isbnReadonly]="true"
        saveLabel="Confirmar datos"
        (save)="confirm($event)"
        (cancelled)="cancel()"
      />
    </mat-dialog-content>
  `,
})
export class BookImportReviewDialog {
  readonly draft = inject<BookFormValue>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<BookImportReviewDialog, BookRequest>);
  private closed = false;

  confirm(request: BookRequest): void {
    if (this.closed || request.isbn !== this.draft.isbn) return;
    this.closed = true;
    this.ref.close(request);
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    this.ref.close();
  }
}
