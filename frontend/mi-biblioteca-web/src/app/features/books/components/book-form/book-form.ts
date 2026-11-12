import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnChanges,
  output,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { BookLookupResponse, BookRequest, BookResponse } from '../../models/book.models';
import { BookFormValue, bookFormValue, buildBookRequest } from './book-form.helpers';
import { createBookForm } from './book-form.factory';
import { GenreSelect } from '../genre-select/genre-select';
import { InlineFeedback } from '../../../../core/ui/feedback/inline-feedback';

@Component({
  selector: 'app-book-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    GenreSelect,
    InlineFeedback,
  ],
  templateUrl: './book-form.html',
  styleUrl: './book-form.scss',
})
export class BookForm implements OnChanges {
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly initialBook = input<BookResponse | null>(null);
  readonly initialDraft = input<BookFormValue | null>(null);
  readonly saveLabel = input('Guardar');
  readonly isbnReadonly = input(false);
  readonly submitting = input(false);
  readonly saveDisabled = input(false);
  readonly submissionMessage = input('Guardando libro…');
  readonly save = output<BookRequest>();
  readonly submitAttempted = output<void>();
  readonly cancelled = output<void>();
  readonly lookupEnabled = input(false);
  readonly scanEnabled = input(false);
  readonly scanRequested = output<void>();
  readonly lookupLoading = input(false);
  readonly lookupSuccess = input(false);
  readonly lookupError = input<string | null>(null);
  readonly lookupRequested = output<string>();
  readonly isbnChanged = output<string>();
  readonly form = createBookForm();
  constructor() {
    this.form.controls.isbn.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.isbnChanged.emit(value));
    for (const control of Object.values(this.form.controls)) {
      this.watchServerErrors(control);
    }
  }

  canLookup(): boolean {
    const isbn = this.form.controls.isbn;
    return isbn.value.trim().length > 0 && !isbn.hasError('maxlength') && !isbn.hasError('pattern');
  }

  synchronizeCoverUrl(coverUrl: string | null): void {
    this.form.controls.coverUrl.setValue(coverUrl ?? '');
  }

  requestLookup(): void {
    if (!this.lookupEnabled() || this.lookupLoading() || this.submitting() || !this.canLookup())
      return;
    this.lookupRequested.emit(this.form.controls.isbn.value);
  }

  applyLookup(proposal: BookLookupResponse): void {
    for (const field of ['title', 'author', 'publisher', 'language', 'coverUrl'] as const) {
      const control = this.form.controls[field];
      const value = proposal[field];
      if (!control.value.trim() && value !== null && control.value !== value) {
        control.setValue(value);
        control.markAsDirty();
      }
    }
    for (const field of ['publicationYear', 'pageCount'] as const) {
      const control = this.form.controls[field];
      const value = proposal[field];
      if (control.value === null && value !== null) {
        control.setValue(value);
        control.markAsDirty();
      }
    }
    const isbn = this.form.controls.isbn;
    if (isbn.value !== proposal.isbn) {
      // This confirmed normalization is not a user edit/cancellation event.
      isbn.setValue(proposal.isbn, { emitEvent: false });
      this.clearServerError(isbn);
      isbn.markAsDirty();
    }
    const genres = this.form.controls.genres;
    if (genres.value.length === 0 && proposal.genres.length > 0) {
      genres.setValue([...proposal.genres]);
      genres.markAsDirty();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const book = this.initialBook();
    const draft = this.initialDraft();
    if (!((changes['initialBook'] && book) || (changes['initialDraft'] && draft))) return;
    const value = draft ?? (book ? bookFormValue(book) : null);
    if (!value) return;
    this.form.reset(value);
  }

  submit(): void {
    if (this.submitting() || this.saveDisabled()) return;
    this.submitAttempted.emit();
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusInvalidField();
      return;
    }
    this.save.emit(buildBookRequest(this.form.getRawValue()));
  }

  cancel(): void {
    if (!this.submitting()) this.cancelled.emit();
  }

  fieldError(control: AbstractControl): string {
    const errors = control.errors;
    if (!errors) return '';
    if (errors['required']) return 'Este campo no puede estar vacío';
    if (errors['maxlength']) return `Máximo ${errors['maxlength'].requiredLength} caracteres`;
    if (errors['integer']) return 'Introduce un número entero';
    if (errors['min']) return `El valor mínimo es ${errors['min'].min}`;
    if (errors['max']) return `El valor máximo es ${errors['max'].max}`;
    if (errors['pattern']) return 'Introduce un ISBN con formato válido';
    if (errors['language']) return 'Introduce un código de idioma reconocido de dos letras';
    if (errors['coverUrl'])
      return 'Introduce una URL HTTP/HTTPS válida, sin espacios ni credenciales';
    if (errors['duplicate']) return 'Hay géneros duplicados';
    if (errors['genreLimit']) return 'Puedes añadir un máximo de 10 géneros';
    if (errors['genreValue'] !== undefined) return 'Hay un género que no cumple las reglas';
    return 'Revisa este valor';
  }

  markIsbnConflict(): void {
    this.setServerError(this.form.controls.isbn);
  }

  applyFieldErrors(problem: unknown): void {
    if (!problem || typeof problem !== 'object' || !('errors' in problem)) return;
    const errors = problem.errors;
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return;
    for (const [field, message] of Object.entries(errors)) {
      if (typeof message !== 'string') continue;
      if (Object.hasOwn(this.form.controls, field)) {
        this.setServerError(this.form.get(field)!);
      } else {
        const match = /^genres(?:\[(\d+)\])?$/.exec(field);
        if (match) this.setServerError(this.form.controls.genres);
      }
    }
  }

  private setServerError(control: AbstractControl): void {
    control.setErrors({ ...control.errors, server: true });
    control.markAsTouched();
  }

  private clearServerError(control: AbstractControl): void {
    if (!control.hasError('server')) return;
    const errors = { ...control.errors };
    delete errors['server'];
    control.setErrors(Object.keys(errors).length ? errors : null, { emitEvent: false });
  }

  private watchServerErrors(control: AbstractControl): void {
    control.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearServerError(control));
  }

  private focusInvalidField(): void {
    // Form control classes update on the next render; use control state, not DOM validity.
    const field = Object.entries(this.form.controls).find(([, control]) => control.invalid)?.[0];
    const selector =
      !field || field === 'genres' ? '#genre-search' : `[formControlName="${field}"]`;
    this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }
}
