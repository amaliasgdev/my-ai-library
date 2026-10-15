import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ReconciliationDestination, ReconciliationDetail } from '../models/reconciliation.models';

export interface ReconciliationConfirmation {
  detail: ReconciliationDetail;
  destination: ReconciliationDestination;
}
@Component({
  selector: 'app-reconciliation-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `<h2 mat-dialog-title>Confirmar conciliación</h2>
    <mat-dialog-content>
      <h3>Origen legacy</h3>
      <ul>
        @for (variant of data.detail.variants; track $index) {
          <li>
            {{ variant.room ?? 'Sin habitación' }} / {{ variant.bookcase ?? 'Sin estantería' }} /
            {{ variant.shelf ?? 'Sin balda' }} — {{ variant.bookCount }} libros
          </li>
        }
      </ul>
      <h3>Destino estructurado</h3>
      <p>
        {{ data.destination.roomName }} · {{ data.destination.bookcaseName }} ·
        {{ data.destination.shelfName }}
      </p>
      @if (data.detail.group.type === 'PARTIAL') {
        <p>
          Estos libros comparten una ubicación incompleta; eso no garantiza que pertenezcan a la
          misma balda.
        </p>
      }
      <p>
        Se reemplazará la ubicación textual de {{ data.detail.reviewedCount }} libros por esta balda
        estructurada. No se conservará historial de la ubicación textual anterior y no existe
        deshacer automático.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions
      ><button mat-button [mat-dialog-close]="false">Cancelar</button
      ><button mat-flat-button [mat-dialog-close]="true">
        Confirmar conciliación
      </button></mat-dialog-actions
    >`,
})
export class ReconciliationConfirmDialog {
  readonly data = inject<ReconciliationConfirmation>(MAT_DIALOG_DATA);
}
