import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { BookForm } from '../../components/book-form/book-form';
import { BookRequest } from '../../models/book.models';
import { BooksService } from '../../services/books.service';

@Component({
  selector: 'app-book-create',
  imports: [BookForm],
  templateUrl: './book-create.html',
  styleUrl: './book-create.scss',
})
export class BookCreate {
  private readonly service = inject(BooksService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly editor = viewChild.required(BookForm);
  readonly submitting = signal(false);
  readonly generalError = signal<string | null>(null);

  save(request: BookRequest): void {
    if (this.submitting()) return;
    this.generalError.set(null);
    this.submitting.set(true);
    this.service
      .createBook(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/books']);
        },
        error: (error: unknown) => {
          let message = 'No se pudo guardar el libro';
          if (error instanceof HttpErrorResponse) {
            if (error.status === 0) message = 'No se puede conectar con el servidor';
            else if (error.status === 400) {
              message = 'Revisa los campos indicados';
              this.editor().applyFieldErrors(error.error);
            } else if (error.status === 409) {
              message = 'Ya existe un libro con ese ISBN';
              this.editor().markIsbnConflict();
            } else if (error.status >= 500 && error.status < 600)
              message = 'El servidor no pudo guardar el libro';
          }
          this.generalError.set(message);
        },
      });
  }

  cancel(): void {
    if (!this.submitting()) void this.router.navigate(['/books']);
  }
}
