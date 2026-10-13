import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { normalizeManualIsbnImport } from '../../models/manual-isbn-import';

const manualIsbnValidator: ValidatorFn = (control) =>
  typeof control.value === 'string' && normalizeManualIsbnImport(control.value) !== null
    ? null
    : { isbn: true };

@Component({
  selector: 'app-book-isbn-import-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './book-isbn-import-dialog.html',
  styleUrl: './book-isbn-import-dialog.scss',
})
export class BookIsbnImportDialog {
  private readonly ref = inject(MatDialogRef<BookIsbnImportDialog, string>);
  readonly form = new FormGroup({
    isbn: new FormControl('', { nonNullable: true, validators: [manualIsbnValidator] }),
  });
  private closed = false;

  submit(): void {
    if (this.closed) return;
    const isbn = normalizeManualIsbnImport(this.form.controls.isbn.value);
    if (!isbn) {
      this.form.controls.isbn.markAsTouched();
      return;
    }
    this.closed = true;
    this.ref.close(isbn);
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    this.ref.close();
  }
}
