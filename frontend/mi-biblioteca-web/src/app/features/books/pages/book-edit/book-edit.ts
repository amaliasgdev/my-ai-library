import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, map, of, startWith, switchMap } from 'rxjs';
import { BookForm } from '../../components/book-form/book-form';
import { BookRequest, BookResponse } from '../../models/book.models';
import { BooksService } from '../../services/books.service';

type EditState =
  | { status: 'loading' }
  | { status: 'loaded'; id: number; book: BookResponse }
  | { status: 'error'; message: string };

function loadError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) return 'El libro no existe';
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo cargar el libro';
  }
  return 'No se pudo cargar el libro';
}

@Component({
  selector: 'app-book-edit',
  imports: [BookForm, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './book-edit.html',
  styleUrl: './book-edit.scss',
})
export class BookEdit {
  private readonly service = inject(BooksService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly editor = viewChild(BookForm);
  readonly state = signal<EditState>({ status: 'loading' });
  readonly submitting = signal(false);
  readonly generalError = signal<string | null>(null);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        switchMap((rawId) => {
          const id = Number(rawId);
          if (!rawId || !/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) {
            return of<EditState>({
              status: 'error',
              message: 'El identificador del libro no es válido',
            });
          }
          return this.service.getBook(id).pipe(
            map((book): EditState => ({ status: 'loaded', id, book })),
            catchError((error: unknown) =>
              of<EditState>({ status: 'error', message: loadError(error) }),
            ),
            startWith<EditState>({ status: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.generalError.set(null);
        this.state.set(state);
      });
  }

  save(request: BookRequest): void {
    const state = this.state();
    if (this.submitting() || state.status !== 'loaded') return;
    this.generalError.set(null);
    this.submitting.set(true);
    this.service
      .updateBook(state.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/books']);
        },
        error: (error: unknown) => {
          let message = 'No se pudieron guardar los cambios';
          if (error instanceof HttpErrorResponse) {
            if (error.status === 0) message = 'No se puede conectar con el servidor';
            else if (error.status === 400) {
              message = 'Revisa los campos indicados';
              this.editor()?.applyFieldErrors(error.error);
            } else if (error.status === 404) message = 'El libro ya no existe';
            else if (error.status === 409) {
              message = 'Ya existe un libro con ese ISBN';
              this.editor()?.markIsbnConflict();
            } else if (error.status >= 500 && error.status < 600)
              message = 'El servidor no pudo guardar los cambios';
          }
          this.generalError.set(message);
        },
      });
  }

  cancel(): void {
    if (!this.submitting()) void this.router.navigate(['/books']);
  }
}
