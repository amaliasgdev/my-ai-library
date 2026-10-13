import { Component, computed, effect, input, output, signal } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { LocationCreation, LocationSelection, RoomNode } from '../models/location.models';

@Component({
  selector: 'app-location-selector',
  imports: [MatSelectModule, MatFormFieldModule, MatButtonModule],
  template: `
    @if (legacy()) {
      <p>
        Ubicación textual anterior pendiente. Puedes conservarla, editarla o sustituirla por una
        balda.
      </p>
    }
    @if (shelfId() && !opened()) {
      <p>Balda estructurada seleccionada: {{ selectionSummary() }}</p>
    }
    <button mat-button type="button" [disabled]="disabled()" (click)="open()">Elegir balda</button>
    <button mat-button type="button" [disabled]="disabled()" (click)="clear()">
      Quitar ubicación
    </button>
    @if (opened()) {
      @if (loading()) {
        <p role="status">Cargando ubicaciones…</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button
          mat-button
          type="button"
          [disabled]="disabled() || loading()"
          (click)="loadRequested.emit()"
        >
          Reintentar ubicaciones
        </button>
      }
      @if (rooms(); as options) {
        <div class="selects">
          <mat-form-field
            ><mat-label>Habitación</mat-label
            ><mat-select
              [value]="roomId()"
              [disabled]="disabled()"
              (selectionChange)="roomChanged($event.value)"
            >
              @for (room of options; track room.id) {
                <mat-option [value]="room.id">{{ room.name }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field
            ><mat-label>Estantería</mat-label
            ><mat-select
              [value]="bookcaseId()"
              [disabled]="disabled() || !roomId()"
              (selectionChange)="bookcaseChanged($event.value)"
            >
              @for (bookcase of bookcases(); track bookcase.id) {
                <mat-option [value]="bookcase.id">{{ bookcase.name }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field
            ><mat-label>Balda</mat-label
            ><mat-select
              [value]="shelfId()"
              [disabled]="disabled() || !bookcaseId()"
              (selectionChange)="shelfChanged($event.value)"
            >
              @for (shelf of shelves(); track shelf.id) {
                <mat-option [value]="shelf.id">{{ shelf.name }}</mat-option>
              }
            </mat-select></mat-form-field
          >
        </div>
        @if (roomId() && !shelfId()) {
          <p role="status">Selecciona una balda para completar la ubicación.</p>
        }
        <div class="actions">
          <button
            mat-button
            type="button"
            [disabled]="disabled()"
            (click)="createRequested.emit({ level: 'rooms' })"
          >
            Nueva habitación
          </button>
          <button
            mat-button
            type="button"
            [disabled]="disabled() || !roomId()"
            (click)="createRequested.emit({ level: 'bookcases', parentId: roomId()! })"
          >
            Nueva estantería
          </button>
          <button
            mat-button
            type="button"
            [disabled]="disabled() || !bookcaseId()"
            (click)="createRequested.emit({ level: 'shelves', parentId: bookcaseId()! })"
          >
            Nueva balda
          </button>
        </div>
        <p>Crear una ubicación la guarda inmediatamente, aunque canceles el libro después.</p>
      }
    }
  `,
  styles: `
    .selects {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
    }
    mat-form-field {
      min-width: 0;
    }
  `,
})
export class LocationSelector {
  readonly rooms = input<RoomNode[] | null>(null);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly shelfId = input<number | null>(null);
  readonly legacy = input(false);
  readonly summary = input('');
  readonly selectionSummary = computed(() => {
    for (const room of this.rooms() ?? [])
      for (const bookcase of room.bookcases) {
        const shelf = bookcase.shelves.find((s) => s.id === this.shelfId());
        if (shelf) return `${room.name} · ${bookcase.name} · Balda ${shelf.name}`;
      }
    return this.summary().trim() || 'Pulsa Elegir balda para consultar sus nombres';
  });
  readonly disabled = input(false);
  readonly loadRequested = output<void>();
  readonly createRequested = output<LocationCreation>();
  readonly selected = output<LocationSelection>();
  readonly opened = signal(false);
  readonly roomId = signal<number | null>(null);
  readonly bookcaseId = signal<number | null>(null);
  readonly bookcases = computed(
    () => this.rooms()?.find((r) => r.id === this.roomId())?.bookcases ?? [],
  );
  readonly shelves = computed(
    () => this.bookcases().find((b) => b.id === this.bookcaseId())?.shelves ?? [],
  );
  constructor() {
    effect(() => {
      const shelfId = this.shelfId();
      const rooms = this.rooms();
      if (!shelfId || !rooms) return;
      for (const room of rooms)
        for (const bookcase of room.bookcases)
          if (bookcase.shelves.some((s) => s.id === shelfId)) {
            this.roomId.set(room.id);
            this.bookcaseId.set(bookcase.id);
            return;
          }
    });
  }
  open() {
    if (this.disabled()) return;
    this.opened.set(true);
    this.loadRequested.emit();
  }
  roomChanged(id: number) {
    if (this.disabled()) return;
    this.roomId.set(id);
    this.bookcaseId.set(null);
    this.selected.emit({ shelfId: null, incomplete: true, clearLegacy: true });
  }
  bookcaseChanged(id: number) {
    if (this.disabled()) return;
    this.bookcaseId.set(id);
    this.selected.emit({ shelfId: null, incomplete: true, clearLegacy: true });
  }
  shelfChanged(id: number) {
    if (this.disabled()) return;
    this.selected.emit({ shelfId: id, incomplete: false, clearLegacy: true });
  }
  clear() {
    if (this.disabled()) return;
    this.roomId.set(null);
    this.bookcaseId.set(null);
    this.selected.emit({ shelfId: null, incomplete: false, clearLegacy: true });
  }
}
