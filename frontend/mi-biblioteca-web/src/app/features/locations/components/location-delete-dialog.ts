import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-location-delete-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `<h2 mat-dialog-title>Eliminar ubicación</h2>
    <mat-dialog-content>¿Eliminar {{ name }}? No se eliminarán libros.</mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button [mat-dialog-close]="true">Eliminar</button>
    </mat-dialog-actions>`,
})
export class LocationDeleteDialog {
  readonly name = inject<string>(MAT_DIALOG_DATA);
}
