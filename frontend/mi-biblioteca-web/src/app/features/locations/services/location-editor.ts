import { DestroyRef, inject, Injectable, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { LocationCreation, LocationItem, RoomNode } from '../models/location.models';
import { LocationsService } from './locations.service';
import { LocationNameDialog } from '../components/location-name-dialog';

/** Page-scoped orchestration used by Create/Edit/ImportReview; never by BookForm. */
@Injectable()
export class LocationEditor {
  private readonly injector = inject(Injector);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly rooms = signal<RoomNode[] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private loadSubscription: Subscription | null = null;
  private ref: MatDialogRef<LocationNameDialog, LocationItem> | null = null;
  constructor() {
    this.destroyRef.onDestroy(() => {
      this.ref?.close();
    });
  }
  load() {
    if (this.loading()) return;
    this.loadSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.loadSubscription = this.injector
      .get(LocationsService)
      .getLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rooms) => {
          this.rooms.set(rooms);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('No se pudieron cargar las ubicaciones');
        },
      });
  }
  create(request: LocationCreation) {
    if (this.ref) return;
    const label =
      request.level === 'rooms'
        ? 'Nueva habitación'
        : request.level === 'bookcases'
          ? 'Nueva estantería'
          : 'Nueva balda';
    const ref = this.dialog.open<LocationNameDialog, unknown, LocationItem>(LocationNameDialog, {
      data: { ...request, title: label },
      width: '30rem',
      maxWidth: '95vw',
    });
    this.ref = ref;
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((item) => {
        if (this.ref !== ref) return;
        this.ref = null;
        if (item) this.load();
      });
  }
}
