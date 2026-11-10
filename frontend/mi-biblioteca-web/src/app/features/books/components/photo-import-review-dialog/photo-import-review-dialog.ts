import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BookForm } from '../book-form/book-form';
import { BookFormValue } from '../book-form/book-form.helpers';
import { validConfirmedBookRequest } from '../book-form/book-form.factory';
import { BookRequest } from '../../models/book.models';

@Component({
  selector: 'app-photo-import-review-dialog',
  imports: [MatDialogModule, MatCheckboxModule, BookForm],
  template: `
    <h2 mat-dialog-title>Revisar datos reales del libro</h2>
    <mat-dialog-content>
      <p>
        El reconocimiento es simulado: sus ejemplos no corresponden a la fotografía. Comprueba los
        datos del libro real. Confirmar no crea ningún libro.
      </p>
      <mat-checkbox [checked]="realConfirmed()" (change)="realConfirmed.set($event.checked)"
        >Confirmo que estos son los datos del libro real, no un ejemplo simulado</mat-checkbox
      >
      <app-book-form
        [initialDraft]="data"
        [saveDisabled]="!realConfirmed()"
        saveLabel="Confirmar revisión"
        (save)="confirm($event)"
        (cancelled)="ref.close()"
      />
    </mat-dialog-content>
  `,
})
export class PhotoImportReviewDialog {
  readonly data = inject<BookFormValue>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PhotoImportReviewDialog, BookRequest>);
  readonly realConfirmed = signal(false);
  private closed = false;
  confirm(request: BookRequest): void {
    if (!this.closed && this.realConfirmed() && validConfirmedBookRequest(request)) {
      this.closed = true;
      this.ref.close(request);
    }
  }
}
