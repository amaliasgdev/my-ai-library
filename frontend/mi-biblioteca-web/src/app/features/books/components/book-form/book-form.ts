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
import { BookRequest, BookResponse } from '../../models/book.models';
import { bookFormValue, buildBookRequest } from './book-form.helpers';
import {
  CRUD_ISBN_PATTERN,
  genreList,
  httpCoverUrl,
  integer,
  isoLanguage,
  notBlank,
  optionalText,
} from './book-form.validators';

@Component({
  selector: 'app-book-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './book-form.html',
  styleUrl: './book-form.scss',
})
export class BookForm implements OnChanges {
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly initialBook = input<BookResponse | null>(null);
  readonly submitting = input(false);
  readonly save = output<BookRequest>();
  readonly cancelled = output<void>();
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

  ngOnChanges(changes: SimpleChanges): void {
    const book = this.initialBook();
    if (!changes['initialBook'] || !book) return;
    const value = bookFormValue(book);
    this.form.controls.genres.clear();
    for (const genre of value.genres) this.form.controls.genres.push(this.genreControl(genre));
    this.form.reset(value);
    this.genreInput.reset();
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
    genres.push(this.genreControl(value));
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
    if (errors['duplicate']) return 'Este género ya está añadido';
    if (errors['genreLimit']) return 'Puedes añadir un máximo de 10 géneros';
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

  private genreControl(value: string): FormControl<string> {
    const control = new FormControl(value, {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(50)],
    });
    this.watchServerErrors(control);
    return control;
  }

  private focusInvalidField(): void {
    // Form control classes update on the next render; use control state, not DOM validity.
    const field = Object.entries(this.form.controls).find(([, control]) => control.invalid)?.[0];
    const selector = !field || field === 'genres' ? '#genre-input' : `[formControlName="${field}"]`;
    this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }
}
