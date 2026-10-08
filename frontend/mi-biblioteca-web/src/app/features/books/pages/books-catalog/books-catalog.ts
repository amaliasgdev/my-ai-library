import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BehaviorSubject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { BookCard } from '../../components/book-card/book-card';
import { BookPageResponse, BooksPageRequest } from '../../models/book.models';
import { BooksService } from '../../services/books.service';

type CatalogState =
  | { status: 'loading' }
  | { status: 'success'; response: BookPageResponse }
  | { status: 'error'; message: string };

function spanishPaginator(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Libros por página';
  intl.nextPageLabel = 'Página siguiente';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primera página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (page, size, length) => {
    if (length === 0 || size === 0) return `0 de ${length}`;
    const start = page * size;
    if (start >= length) return `0 de ${length}`;
    return `${start + 1}–${Math.min(start + size, length)} de ${length}`;
  };
  return intl;
}

function catalogError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status === 400) return 'No se pudo cargar el catálogo con estos parámetros';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo cargar el catálogo';
  }
  return 'No se pudo cargar el catálogo';
}

@Component({
  selector: 'app-books-catalog',
  imports: [BookCard, MatButtonModule, MatPaginatorModule, MatProgressSpinnerModule, RouterLink],
  providers: [{ provide: MatPaginatorIntl, useFactory: spanishPaginator }],
  templateUrl: './books-catalog.html',
  styleUrl: './books-catalog.scss',
})
export class BooksCatalog {
  private readonly booksService = inject(BooksService);
  private readonly query = new BehaviorSubject<BooksPageRequest>({ page: 0, size: 20 });
  protected readonly state = signal<CatalogState>({ status: 'loading' });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly totalElements = signal(0);
  protected readonly pageSizeOptions = [10, 20, 50, 100];
  protected readonly announcement = computed(() => {
    const state = this.state();
    if (state.status === 'loading') return 'Cargando libros…';
    if (state.status === 'error') return '';
    if (state.response.totalElements === 0) return 'Tu biblioteca todavía no tiene libros';
    if (state.response.content.length === 0) return 'No hay libros en esta página';
    return `Mostrando ${state.response.content.length} de ${state.response.totalElements} libros`;
  });

  constructor() {
    this.query
      .pipe(
        switchMap((query) =>
          this.booksService.getBooks({ ...query, sortBy: 'title', direction: 'ASC' }).pipe(
            map((response): CatalogState => {
              // HTTP generic types do not validate the actual JSON response.
              if (!response || !Array.isArray(response.content)) {
                throw new Error('Invalid book page response');
              }
              return { status: 'success', response };
            }),
            catchError((error: unknown) =>
              of<CatalogState>({ status: 'error', message: catalogError(error) }),
            ),
            startWith<CatalogState>({ status: 'loading' }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        if (state.status === 'success') {
          this.pageIndex.set(state.response.page);
          this.pageSize.set(state.response.size);
          this.totalElements.set(state.response.totalElements);
        }
        this.state.set(state);
      });
  }

  onPageChange(event: PageEvent): void {
    const page = event.pageSize === this.pageSize() ? event.pageIndex : 0;
    this.loadPage(page, event.pageSize);
  }

  protected retry(): void {
    this.loadPage(this.pageIndex(), this.pageSize());
  }

  protected firstPage(): void {
    this.loadPage(0, this.pageSize());
  }

  private loadPage(page: number, size: number): void {
    this.pageIndex.set(page);
    this.pageSize.set(size);
    this.query.next({ page, size });
  }
}
