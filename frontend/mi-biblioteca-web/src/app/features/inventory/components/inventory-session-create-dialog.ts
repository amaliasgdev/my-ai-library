import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { InventoryShelfContext } from '../models/inventory-session.models';

@Component({
  selector: 'app-inventory-session-create-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `<h2 mat-dialog-title>Iniciar inventario</h2>
    <form (ngSubmit)="submit()">
      <mat-dialog-content>
        <p>{{ shelf.roomName }} > {{ shelf.bookcaseName }} > {{ shelf.shelfName }}</p>
        <mat-form-field
          ><mat-label>Notas opcionales</mat-label
          ><textarea matInput [formControl]="notes" rows="5"></textarea
          ><mat-error>Máximo 2000 caracteres</mat-error></mat-form-field
        >
      </mat-dialog-content>
      <mat-dialog-actions
        ><button mat-button type="button" [mat-dialog-close]="undefined">Cancelar</button
        ><button mat-flat-button type="submit">Iniciar inventario</button></mat-dialog-actions
      >
    </form>`,
  styles: `
    mat-form-field {
      width: 100%;
    }
  `,
})
export class InventorySessionCreateDialog {
  readonly shelf = inject<InventoryShelfContext>(MAT_DIALOG_DATA);
  private readonly ref = inject(
    MatDialogRef<InventorySessionCreateDialog, { notes: string | null }>,
  );
  readonly notes = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(2000)],
  });
  submit() {
    this.notes.markAsTouched();
    if (this.notes.valid) this.ref.close({ notes: this.notes.value || null });
  }
}
