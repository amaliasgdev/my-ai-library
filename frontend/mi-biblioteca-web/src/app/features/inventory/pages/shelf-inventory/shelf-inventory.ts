import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import {
  inventoryId,
  inventoryPaging,
  INVENTORY_STATUS_LABELS,
  InventorySessionStatus,
  ShelfInventorySessionsResponse,
} from '../../models/inventory-session.models';
import { InventorySessionsService } from '../../services/inventory-sessions.service';
import { InventoryWrite } from '../../services/inventory-write';
import { InventorySessionCreateDialog } from '../../components/inventory-session-create-dialog';
import { InventorySessionConfirmDialog } from '../../components/inventory-session-confirm-dialog';

@Component({
  selector: 'app-shelf-inventory',
  providers: [InventoryWrite],
  imports: [DatePipe, RouterLink, MatButtonModule, MatPaginatorModule, MatTableModule],
  templateUrl: './shelf-inventory.html',
  styleUrl: './shelf-inventory.scss',
})
export class ShelfInventory {
  private readonly service = inject(InventorySessionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  readonly write = inject(InventoryWrite);
  readonly data = signal<ShelfInventorySessionsResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly labels = INVENTORY_STATUS_LABELS;
  readonly columns = ['started', 'status', 'notes', 'actions'];
  private readonly reload = new Subject<void>();
  private id: number | null = null;
  private ref: MatDialogRef<
    InventorySessionCreateDialog | InventorySessionConfirmDialog,
    unknown
  > | null = null;
  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        map(([params, query]) => ({
          id: inventoryId(params.get('shelfId')),
          ...inventoryPaging(query),
        })),
        distinctUntilChanged((a, b) => a.id === b.id && a.page === b.page && a.size === b.size),
        switchMap((query) => {
          this.ref?.close();
          this.ref = null;
          this.write.reset();
          this.id = query.id;
          return this.reload.pipe(
            startWith(undefined),
            switchMap(() => {
              this.data.set(null);
              this.error.set(null);
              this.loading.set(query.id !== null);
              if (query.id === null) {
                this.error.set('Identificador de balda inválido.');
                return of(null);
              }
              return this.service.history(query.id, query.page, query.size).pipe(
                catchError(() => {
                  this.error.set(
                    'No se pudo cargar el inventario. Reintentar consulta solo el estado actual.',
                  );
                  return of(null);
                }),
              );
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        this.data.set(data);
        if (data) this.write.synchronized();
      });
    this.destroyRef.onDestroy(() => {
      this.ref?.close();
      this.ref = null;
    });
  }
  retry() {
    if (!this.write.pending() && !this.ref && this.id !== null) this.reload.next();
  }
  paging() {
    const data = this.data();
    return { page: data?.page ?? 0, size: data?.size ?? 20 };
  }
  statusLabel(status: InventorySessionStatus) {
    return this.labels[status];
  }
  paginate(event: PageEvent) {
    if (this.write.pending() || this.ref) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: event.pageSize === this.data()?.size ? event.pageIndex : 0,
        size: event.pageSize,
      },
    });
  }
  start() {
    const data = this.data();
    if (!data || data.activeSession || this.write.pending() || this.write.needsRead() || this.ref)
      return;
    const ref = this.dialog.open<
      InventorySessionCreateDialog,
      typeof data.shelf,
      { notes: string | null }
    >(InventorySessionCreateDialog, {
      data: data.shelf,
      width: '34rem',
      maxWidth: '96vw',
      autoFocus: 'button',
    });
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (!result) return;
        this.write.run(
          this.service.create(data.shelf.shelfId, result.notes),
          (session) => {
            void this.router.navigate(['/inventory-sessions', session.id], {
              queryParams: this.paging(),
            });
          },
          () => this.retry(),
        );
      });
  }
  closeSession(action: 'complete' | 'cancel') {
    const data = this.data();
    if (!data?.activeSession || this.write.pending() || this.write.needsRead() || this.ref) return;
    const ref = this.dialog.open<InventorySessionConfirmDialog, unknown, boolean>(
      InventorySessionConfirmDialog,
      {
        data: { action, shelf: data.shelf },
        width: '34rem',
        maxWidth: '96vw',
        autoFocus: 'button',
      },
    );
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (confirmed !== true) return;
        const request =
          action === 'complete'
            ? this.service.complete(data.activeSession!.id)
            : this.service.cancel(data.activeSession!.id);
        this.write.run(
          request,
          () => this.retry(),
          () => this.retry(),
        );
      });
  }
}
