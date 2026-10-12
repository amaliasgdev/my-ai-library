import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  distinctUntilChanged,
  finalize,
  map,
  of,
  startWith,
  Subscription,
  switchMap,
} from 'rxjs';
import { BookForm } from '../../components/book-form/book-form';
import { BookRequest, BookResponse } from '../../models/book.models';
import { BooksService } from '../../services/books.service';
import { COVERS_CONFIG } from '../../../../core/config/covers.config';
import { isManagedCover } from '../../models/managed-cover';
import { parseBookId } from '../../models/book-id';

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
  private readonly coversConfig = inject(COVERS_CONFIG);
  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('coverFile');
  readonly editor = viewChild(BookForm);
  readonly state = signal<EditState>({ status: 'loading' });
  readonly submitting = signal(false);
  readonly generalError = signal<string | null>(null);
  readonly initialBook = signal<BookResponse | null>(null);
  readonly coverOperation = signal<'idle' | 'uploading' | 'deleting' | 'reloading' | 'error'>(
    'idle',
  );
  readonly coverError = signal<string | null>(null);
  readonly coverUnsynced = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly imageFailed = signal(false);
  readonly coverPending = computed(() =>
    ['uploading', 'deleting', 'reloading'].includes(this.coverOperation()),
  );
  readonly writesBlocked = computed(
    () => this.submitting() || this.coverPending() || this.coverUnsynced(),
  );
  readonly managedCover = computed(() => {
    const state = this.state();
    return (
      state.status === 'loaded' &&
      isManagedCover(state.book.coverUrl, state.id, this.coversConfig.publicBaseUrl)
    );
  });
  private coverSubscription: Subscription | null = null;
  private routeGeneration = 0;

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        switchMap((rawId) => {
          this.routeGeneration++;
          this.coverSubscription?.unsubscribe();
          this.coverSubscription = null;
          this.coverOperation.set('idle');
          this.coverUnsynced.set(false);
          this.coverError.set(null);
          this.selectedFile.set(null);
          this.clearFileInput();
          this.imageFailed.set(false);
          this.initialBook.set(null);
          const id = parseBookId(rawId);
          if (id === null) {
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
        if (state.status === 'loaded') this.initialBook.set(state.book);
        this.state.set(state);
      });
  }

  selectCover(event: Event): void {
    if (this.writesBlocked()) return;
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedFile.set(file);
    this.coverError.set(file ? this.fileError(file) : null);
    this.coverOperation.set(this.coverError() ? 'error' : 'idle');
  }

  private fileError(file: File): string | null {
    if (file.size === 0) return 'El archivo de portada no es válido';
    if (file.size > 5_242_880) return 'El archivo de portada es demasiado grande';
    if (file.type !== 'image/jpeg' && file.type !== 'image/png')
      return 'El formato de imagen no es compatible';
    return null;
  }

  uploadCover(): void {
    const state = this.state();
    if (this.writesBlocked() || state.status !== 'loaded') return;
    const file = this.selectedFile();
    const error = file ? this.fileError(file) : 'Selecciona un archivo de portada';
    if (error || !file) {
      this.coverError.set(error);
      this.coverOperation.set('error');
      return;
    }
    this.coverError.set(null);
    this.coverOperation.set('uploading');
    const generation = this.routeGeneration;
    this.coverSubscription = this.service
      .uploadCover(state.id, file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (generation === this.routeGeneration && this.coverOperation() === 'uploading')
            this.coverOperation.set('idle');
        }),
      )
      .subscribe({
        next: (book) => {
          if (generation !== this.routeGeneration) return;
          this.confirmCover(state.id, book);
          this.selectedFile.set(null);
          this.clearFileInput();
          this.coverOperation.set('idle');
        },
        error: (error: unknown) => {
          if (generation !== this.routeGeneration) return;
          this.coverError.set(this.coverFailure(error, false));
          this.coverOperation.set('error');
        },
      });
  }

  deleteCover(): void {
    const state = this.state();
    if (this.writesBlocked() || state.status !== 'loaded' || !this.managedCover()) return;
    this.coverError.set(null);
    this.coverOperation.set('deleting');
    const generation = this.routeGeneration;
    this.coverSubscription = this.service
      .deleteCover(state.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (generation === this.routeGeneration && this.coverOperation() === 'deleting')
            this.coverOperation.set('idle');
        }),
      )
      .subscribe({
        next: () => {
          if (generation !== this.routeGeneration) return;
          this.coverUnsynced.set(true);
          this.reloadCover(state.id, generation);
        },
        error: (error: unknown) => {
          if (generation !== this.routeGeneration) return;
          this.coverError.set(this.coverFailure(error, true));
          this.coverOperation.set('error');
        },
      });
  }

  retryCoverReload(): void {
    const state = this.state();
    if (
      state.status !== 'loaded' ||
      !this.coverUnsynced() ||
      this.coverPending() ||
      this.submitting()
    )
      return;
    this.reloadCover(state.id, this.routeGeneration);
  }

  private reloadCover(id: number, generation: number): void {
    this.coverOperation.set('reloading');
    this.coverError.set(null);
    this.coverSubscription = this.service
      .getBook(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (book) => {
          if (generation !== this.routeGeneration) return;
          this.confirmCover(id, book);
          this.coverUnsynced.set(false);
          this.coverOperation.set('idle');
        },
        error: () => {
          if (generation !== this.routeGeneration) return;
          this.coverError.set(
            'La portada se eliminó, pero no se pudo actualizar la información del libro.',
          );
          this.coverOperation.set('error');
        },
      });
  }

  private confirmCover(id: number, book: BookResponse): void {
    const state = this.state();
    if (state.status !== 'loaded' || state.id !== id) return;
    this.state.set({ status: 'loaded', id, book });
    this.editor()?.synchronizeCoverUrl(book.coverUrl);
    this.imageFailed.set(false);
  }

  private clearFileInput(): void {
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  private coverFailure(error: unknown, deleting: boolean): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se puede conectar con el servidor';
      if (error.status === 404) return 'El libro ya no existe';
      if (!deleting && error.status === 400) return 'El archivo de portada no es válido';
      if (!deleting && error.status === 413) return 'El archivo de portada es demasiado grande';
      if (!deleting && error.status === 415) return 'El formato de imagen no es compatible';
      if (error.status >= 500 && error.status < 600)
        return deleting
          ? 'El servidor no pudo eliminar la portada'
          : 'El servidor no pudo guardar la portada';
    }
    return 'No se pudo actualizar la portada';
  }

  save(request: BookRequest): void {
    const state = this.state();
    if (this.writesBlocked() || state.status !== 'loaded') return;
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
    if (!this.submitting() && !this.coverPending()) void this.router.navigate(['/books']);
  }
}
