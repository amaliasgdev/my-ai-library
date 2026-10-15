import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { InventoryShelfContext } from '../models/inventory-session.models';

export interface InventoryConfirmation {
  action: 'complete' | 'cancel';
  shelf: InventoryShelfContext;
  dirtyNotes?: boolean;
}
@Component({
  selector: 'app-inventory-session-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `<h2 mat-dialog-title>
      {{
        data.dirtyNotes
          ? 'Notas sin guardar'
          : data.action === 'complete'
            ? 'Finalizar inventario'
            : 'Cancelar inventario'
      }}
    </h2>
    <mat-dialog-content>
      <p>{{ data.shelf.roomName }} > {{ data.shelf.bookcaseName }} > {{ data.shelf.shelfName }}</p>
      @if (data.dirtyNotes) {
        <p>
          Hay cambios en las notas sin guardar. Puedes volver y guardarlos primero, o descartarlos y
          continuar a la confirmación.
        </p>
      } @else if (data.action === 'complete') {
        <p>
          Se cerrará esta sesión y no podrá reabrirse. Esta acción no compara ni modifica los libros
          del catálogo.
        </p>
      } @else {
        <p>La sesión se conservará en el historial: no se elimina y no podrá reabrirse.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button [mat-dialog-close]="false">
        {{ data.dirtyNotes ? 'Volver para guardar primero' : 'Volver' }}
      </button>
      <button mat-flat-button [mat-dialog-close]="true">
        {{
          data.dirtyNotes
            ? 'Descartar y continuar'
            : data.action === 'complete'
              ? 'Finalizar sesión'
              : 'Cancelar sesión'
        }}
      </button>
    </mat-dialog-actions>`,
})
export class InventorySessionConfirmDialog {
  readonly data = inject<InventoryConfirmation>(MAT_DIALOG_DATA);
}
