import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { notBlank } from '../book-form/book-form.validators';

export interface ManualCandidateResult {
  readonly title: string;
  readonly author: string;
  readonly isbn: string;
  readonly search: boolean;
}

const SINGLE_LINE = /^[^\p{Cc}\p{Zl}\p{Zp}]*$/u;

/** Collects only identification text. It performs no HTTP, routing or persistence. */
@Component({
  selector: 'app-manual-candidate-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Añadir un libro omitido</h2>
    <form [formGroup]="form" (ngSubmit)="submit(true)" novalidate>
      <mat-dialog-content>
        <p>
          Se añade como candidato junto a los reconocidos. No se crea ningún libro ni se usa OpenAI;
          podrás buscar coincidencias, elegir edición y revisarlo antes de importar.
        </p>
        <mat-form-field>
          <mat-label>Título</mat-label>
          <input matInput formControlName="title" maxlength="255" required cdkFocusInitial />
          <mat-error>{{ error('title') }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Autor</mat-label>
          <input matInput formControlName="author" maxlength="255" required />
          <mat-error>{{ error('author') }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>ISBN (opcional)</mat-label>
          <input matInput formControlName="isbn" maxlength="50" />
          <mat-error>{{ error('isbn') }}</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions>
        <button mat-button type="button" (click)="ref.close()">Cancelar</button>
        <button mat-stroked-button type="button" (click)="submit(false)">Añadir sin buscar</button>
        <button mat-flat-button type="submit">Añadir y buscar coincidencias</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    form,
    mat-dialog-content {
      display: grid;
      gap: 0.5rem;
    }
    mat-dialog-actions {
      flex-wrap: wrap;
    }
  `,
})
export class ManualCandidateDialog {
  protected readonly ref =
    inject<MatDialogRef<ManualCandidateDialog, ManualCandidateResult>>(MatDialogRef);
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(255), Validators.pattern(SINGLE_LINE)],
    }),
    author: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(255), Validators.pattern(SINGLE_LINE)],
    }),
    isbn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(50), Validators.pattern(/^[^\p{Cc}]*$/u)],
    }),
  });

  submit(search: boolean): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({
      title: value.title.trim(),
      author: value.author.trim(),
      isbn: value.isbn.trim(),
      search,
    });
  }

  error(name: 'title' | 'author' | 'isbn'): string {
    const control = this.form.controls[name];
    if (control.hasError('required')) {
      return name === 'title' ? 'Indica el título' : 'Indica el autor';
    }
    if (control.hasError('maxlength')) return 'Demasiado largo';
    if (control.hasError('pattern')) return 'Utiliza texto de una sola línea';
    return '';
  }
}
