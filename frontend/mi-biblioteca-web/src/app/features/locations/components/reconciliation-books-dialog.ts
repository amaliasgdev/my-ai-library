import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReconciliationDetail } from '../models/reconciliation.models';
import { ReconciliationService } from '../services/reconciliation.service';

@Component({
  selector: 'app-reconciliation-books-dialog',
  imports: [MatDialogModule, MatButtonModule, MatPaginatorModule, RouterLink],
  template: `
    <h2 mat-dialog-title>Libros de la ubicación anterior</h2>
    <mat-dialog-content>
      @if (loading()) {
        <p role="status">Cargando libros…</p>
      }
      @if (changed()) {
        <p role="alert">
          El grupo cambió durante la revisión. Revisa su contenido actualizado antes de continuar.
        </p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button mat-button (click)="load()">Reintentar lectura</button>
      }
      @if (detail(); as data) {
        <h3>Variantes textuales originales</h3>
        <ul>
          @for (variant of data.variants; track $index) {
            <li>
              {{ variant.room ?? 'Sin habitación' }} / {{ variant.bookcase ?? 'Sin estantería' }} /
              {{ variant.shelf ?? 'Sin balda' }} — {{ variant.bookCount }} libros
            </li>
          }
        </ul>
        <p>Revisión completa: {{ data.reviewedCount }} libros. La lista está paginada.</p>
        <ul>
          @for (book of data.content; track book.id) {
            <li>
              <strong>{{ book.title }}</strong> — {{ book.author }}
              @if (book.isbn) {
                · ISBN {{ book.isbn }}
              }
              <p>
                {{ book.room ?? 'Sin habitación' }} / {{ book.bookcase ?? 'Sin estantería' }} /
                {{ book.shelf ?? 'Sin balda' }}
              </p>
              <a mat-button [routerLink]="['/books', book.id, 'edit']" (click)="close()"
                >Editar libro individualmente</a
              >
            </li>
          }
        </ul>
        <mat-paginator
          aria-label="Páginas de libros del grupo"
          [length]="data.totalElements"
          [pageIndex]="data.page"
          [pageSize]="data.size"
          [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="paginate($event)"
        />
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button (click)="close()">Cancelar</button>
      <button mat-flat-button [disabled]="loading() || !detail() || !!error()" (click)="accept()">
        Usar esta revisión
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    li {
      padding-block: 0.5rem;
      overflow-wrap: anywhere;
    }
  `,
})
export class ReconciliationBooksDialog {
  private readonly key = inject<string>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ReconciliationBooksDialog, ReconciliationDetail>);
  private readonly service = inject(ReconciliationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly detail = signal<ReconciliationDetail | null>(null);
  readonly error = signal<string | null>(null);
  readonly changed = signal(false);
  private request: Subscription | null = null;
  private page = 0;
  private size = 20;
  private fingerprint: string | null = null;
  constructor() {
    this.load();
  }
  load() {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.detail.set(null);
    this.request = this.service
      .detail(this.key, this.page, this.size)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          const identity = detail.snapshotFingerprint;
          if (this.fingerprint !== null && identity !== this.fingerprint) this.changed.set(true);
          this.fingerprint = identity;
          this.detail.set(detail);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('No se pudo revisar el grupo. Puede haber cambiado o desaparecido.');
        },
      });
  }
  paginate(event: PageEvent) {
    this.page = event.pageIndex;
    this.size = event.pageSize;
    this.load();
  }
  close() {
    this.ref.close();
  }
  accept() {
    if (!this.loading() && !this.error() && this.detail()) this.ref.close(this.detail()!);
  }
}
