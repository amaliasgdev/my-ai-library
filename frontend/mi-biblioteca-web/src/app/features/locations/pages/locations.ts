import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { LocationsService } from '../services/locations.service';
import { LocationItem, LocationLevel, RoomNode, ShelfNode } from '../models/location.models';
import { LocationNameDialog } from '../components/location-name-dialog';
import { LocationDeleteDialog } from '../components/location-delete-dialog';

@Component({
  selector: 'app-locations',
  imports: [MatExpansionModule, MatButtonModule, RouterLink],
  templateUrl: './locations.html',
  styleUrl: './locations.scss',
})
export class Locations {
  private readonly service = inject(LocationsService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly rooms = signal<RoomNode[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  private ref: MatDialogRef<LocationNameDialog | LocationDeleteDialog, unknown> | null = null;
  constructor() {
    this.load();
    this.destroyRef.onDestroy(() => this.ref?.close());
  }
  load() {
    if (this.loading() || this.pending()) return;
    this.loading.set(true);
    this.error.set(null);
    this.rooms.set([]);
    this.service
      .getLocations()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (rooms) => this.rooms.set(rooms),
        error: () => this.error.set('No se pudieron cargar las ubicaciones'),
      });
  }
  edit(level: LocationLevel, item?: LocationItem, parentId?: number) {
    if (this.ref || this.loading() || this.pending()) return;
    const noun = level === 'rooms' ? 'habitación' : level === 'bookcases' ? 'estantería' : 'balda';
    const ref = this.dialog.open(LocationNameDialog, {
      data: { level, item, parentId, title: `${item ? 'Renombrar' : 'Nueva'} ${noun}` },
      width: '30rem',
      maxWidth: '95vw',
    });
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (result) this.load();
      });
  }
  remove(level: LocationLevel, item: ShelfNode) {
    if (!item.canDelete || this.ref || this.loading() || this.pending()) return;
    const ref = this.dialog.open(LocationDeleteDialog, {
      data: item.name,
      autoFocus: 'button',
      width: '28rem',
      maxWidth: '95vw',
    });
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (confirmed !== true) return;
        this.pending.set(true);
        this.error.set(null);
        this.service
          .delete(level, item.id)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            finalize(() => this.pending.set(false)),
          )
          .subscribe({
            next: () => {
              this.pending.set(false);
              this.load();
            },
            error: (error: unknown) =>
              this.error.set(
                error instanceof HttpErrorResponse && error.status === 409
                  ? 'La ubicación está en uso. Actualiza la lista antes de eliminar.'
                  : 'No se pudo eliminar la ubicación',
              ),
          });
      });
  }
}
