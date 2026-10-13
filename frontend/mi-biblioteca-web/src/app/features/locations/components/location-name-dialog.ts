import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { finalize } from 'rxjs';
import { locationLabel, notBlank } from '../../books/components/book-form/book-form.validators';
import { LocationCreation, LocationItem } from '../models/location.models';
import { LocationsService } from '../services/locations.service';

export interface LocationNameData extends LocationCreation {
  title: string;
  item?: LocationItem;
}
@Component({
  selector: 'app-location-name-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form (submit)="save($event)">
      <mat-dialog-content>
        <p>Se guarda inmediatamente, aunque después canceles el libro.</p>
        <mat-form-field>
          <mat-label>Nombre</mat-label>
          <input matInput [formControl]="name" [readonly]="pending()" />
          <mat-error
            >Nombre obligatorio, máximo {{ max }} caracteres, una línea sin controles</mat-error
          >
        </mat-form-field>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions>
        <button mat-button type="button" [disabled]="pending()" (click)="cancel()">Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="pending()">Guardar ubicación</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class LocationNameDialog {
  readonly data = inject<LocationNameData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<LocationNameDialog, LocationItem>);
  private readonly service = inject(LocationsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly max = this.data.level === 'shelves' ? 50 : 100;
  readonly name = new FormControl(this.data.item?.name ?? '', {
    nonNullable: true,
    validators: [notBlank, Validators.maxLength(this.max), locationLabel],
  });
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  save(event?: Event) {
    event?.preventDefault();
    if (this.pending()) return;
    this.name.markAsTouched();
    if (this.name.invalid) return;
    this.pending.set(true);
    this.error.set(null);
    this.ref.disableClose = true;
    const request = this.data.item
      ? this.service.rename(this.data.level, this.data.item.id, this.name.value)
      : this.service.create(this.data, this.name.value);
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.pending.set(false);
          this.ref.disableClose = false;
        }),
      )
      .subscribe({
        next: (item) => this.ref.close(item),
        error: (error: unknown) =>
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 409
              ? 'Ya existe ese nombre en esta ubicación'
              : 'No se pudo guardar la ubicación. Revisa el nombre y el padre.',
          ),
      });
  }
  cancel() {
    if (!this.pending()) this.ref.close();
  }
}
