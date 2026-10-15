import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ReconciliationConfirmDialog } from './reconciliation-confirm-dialog';
import {
  testReconciliationDetail,
  testReconciliationGroup,
} from '../models/reconciliation.testing';

describe('ReconciliationConfirmDialog', () => {
  it('shows originals, reviewed quantity, full destination, no-undo warning and initial Cancel action', () => {
    const detail = testReconciliationDetail({
      group: testReconciliationGroup({ type: 'PARTIAL' }),
    });
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [ReconciliationConfirmDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { detail, destination: detail.group.destinationSuggestion },
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(ReconciliationConfirmDialog);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Se reemplazará la ubicación textual de 2 libros');
    expect(element.textContent).toContain('no existe deshacer automático');
    expect(element.textContent).toContain('No se conservará historial');
    expect(element.textContent).toContain('Estos libros comparten una ubicación incompleta');
    expect(element.textContent).toContain('salón');
    expect(element.textContent).toContain('Salón · Billy izquierda · Superior');
    const buttons = element.querySelectorAll('button');
    expect(buttons[0].textContent).toContain('Cancelar');
    buttons[0].click();
    expect(close).toHaveBeenCalledWith(false);
  });
});
