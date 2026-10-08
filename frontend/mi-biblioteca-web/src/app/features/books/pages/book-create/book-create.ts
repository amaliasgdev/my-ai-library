import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { BookRequest } from '../../models/book.models';
import { BooksService } from '../../services/books.service';
import {
  CRUD_ISBN_PATTERN,
  genreList,
  httpCoverUrl,
  integer,
  isoLanguage,
  notBlank,
  optionalText,
} from './book-create.validators';

@Component({
  selector: 'app-book-create',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './book-create.html',
  styleUrl: './book-create.scss',
})
export class BookCreate {
  private readonly booksService = inject(BooksService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly submitting = signal(false);
  readonly generalError = signal<string | null>(null);
  readonly genreInput = new FormControl('', {
    nonNullable: true,
    validators: [notBlank, Validators.maxLength(50)],
  });
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(255)],
    }),
    author: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(255)],
    }),
    isbn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20), optionalText(Validators.pattern(CRUD_ISBN_PATTERN))],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    publisher: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    publicationYear: new FormControl<number | null>(null, [
      integer,
      Validators.min(1),
      Validators.max(2100),
    ]),
    pageCount: new FormControl<number | null>(null, [
      integer,
      Validators.min(1),
      Validators.max(2147483647),
    ]),
    language: new FormControl('', { nonNullable: true, validators: [isoLanguage] }),
    coverUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2048), httpCoverUrl],
    }),
    genres: new FormArray<FormControl<string>>([], genreList),
  });

  constructor() {
    for (const control of Object.values(this.form.controls)) {
      this.watchServerErrors(control);
    }
  }

  addGenre(): boolean {
    if (this.submitting()) return false;
    this.genreInput.markAsTouched();
    this.genreInput.updateValueAndValidity();
    if (this.genreInput.invalid) return false;
    const genres = this.form.controls.genres;
    if (genres.length >= 10) {
      this.genreInput.setErrors({ genreLimit: true });
      return false;
    }
    const value = this.genreInput.value.trim();
    if (genres.value.some((genre) => genre.trim().toLowerCase() === value.toLowerCase())) {
      this.genreInput.setErrors({ duplicate: true });
      return false;
    }
    const control = new FormControl(value, {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(50)],
    });
    this.watchServerErrors(control);
    genres.push(control);
    genres.markAsDirty();
    this.genreInput.reset();
    return true;
  }

  onGenreEnter(event: Event): void {
    event.preventDefault();
    this.addGenre();
  }

  removeGenre(index: number): void {
    if (this.submitting()) return;
    this.form.controls.genres.removeAt(index);
    this.form.controls.genres.markAsDirty();
    this.genreInput.updateValueAndValidity();
  }

  submit(): void {
    if (this.submitting()) return;
    const pending = this.genreInput.value.length > 0;
    const added = !pending || this.addGenre();
    this.form.markAllAsTouched();
    if (!added || this.form.invalid) {
      this.focusInvalidField();
      return;
    }
    this.generalError.set(null);
    const request = this.buildRequest();
    this.submitting.set(true);
    this.booksService
      .createBook(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/books']);
        },
        error: (error: unknown) => this.handleError(error),
      });
  }

  cancel(): void {
    if (!this.submitting()) void this.router.navigate(['/books']);
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
    if (errors['duplicate']) return 'Este género ya está añadido';
    if (errors['genreLimit']) return 'Puedes añadir un máximo de 10 géneros';
    return 'Revisa este valor';
  }

  private buildRequest(): BookRequest {
    const value = this.form.getRawValue();
    const optional = (text: string): string | null => (text.trim() ? text : null);
    return {
      title: value.title,
      author: value.author,
      isbn: optional(value.isbn),
      description: optional(value.description),
      coverUrl: value.coverUrl === '' ? null : value.coverUrl,
      publisher: optional(value.publisher.trim()),
      publicationYear: value.publicationYear,
      pageCount: value.pageCount,
      language: optional(value.language.toLowerCase()),
      genres: value.genres.map((genre) => genre.trim()),
    };
  }

  private handleError(error: unknown): void {
    let message = 'No se pudo guardar el libro';
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) message = 'No se puede conectar con el servidor';
      else if (error.status === 400) {
        message = 'Revisa los campos indicados';
        this.applyFieldErrors(error.error);
      } else if (error.status === 409) {
        message = 'Ya existe un libro con ese ISBN';
        this.setServerError(this.form.controls.isbn);
      } else if (error.status >= 500 && error.status < 600)
        message = 'El servidor no pudo guardar el libro';
    }
    this.generalError.set(message);
  }

  private applyFieldErrors(problem: unknown): void {
    if (!problem || typeof problem !== 'object' || !('errors' in problem)) return;
    const errors = problem.errors;
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return;
    for (const [field, message] of Object.entries(errors)) {
      if (typeof message !== 'string') continue;
      if (Object.hasOwn(this.form.controls, field)) {
        this.setServerError(this.form.get(field)!);
      } else {
        const match = /^genres\[(\d+)\]$/.exec(field);
        if (match) {
          const control = this.form.controls.genres.at(Number(match[1]));
          if (control) this.setServerError(control);
        }
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
    const selector = !field || field === 'genres' ? '#genre-input' : `[formControlName="${field}"]`;
    this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }
}
