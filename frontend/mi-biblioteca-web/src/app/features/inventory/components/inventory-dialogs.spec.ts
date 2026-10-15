import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { InventorySessionCreateDialog } from './inventory-session-create-dialog';
import { InventorySessionConfirmDialog } from './inventory-session-confirm-dialog';
import { testInventorySession } from '../models/inventory.testing';

describe('Inventory dialogs', () => {
  it('create shows context, validates raw length without truncation and emits only explicit notes', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [InventorySessionCreateDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: testInventorySession().shelf },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(InventorySessionCreateDialog);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Salón > Billy > Superior');
    fixture.componentInstance.notes.setValue(' '.repeat(2001));
    fixture.componentInstance.submit();
    expect(close).not.toHaveBeenCalled();
    expect(fixture.componentInstance.notes.value.length).toBe(2001);
    fixture.componentInstance.notes.setValue('  line one\nline two  ');
    fixture.componentInstance.submit();
    expect(close).toHaveBeenCalledWith({ notes: '  line one\nline two  ' });
  });
  it.each(['complete', 'cancel'] as const)(
    '%s confirmation warns about irreversible domain action and cancellation has no HTTP',
    (action) => {
      const close = vi.fn();
      TestBed.configureTestingModule({
        imports: [InventorySessionConfirmDialog],
        providers: [
          { provide: MAT_DIALOG_DATA, useValue: { shelf: testInventorySession().shelf, action } },
          { provide: MatDialogRef, useValue: { close } },
        ],
      });
      const fixture = TestBed.createComponent(InventorySessionConfirmDialog);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain('no podrá reabrirse');
      expect(element.textContent).toContain(
        action === 'complete' ? 'no compara ni modifica' : 'no se elimina',
      );
      element.querySelector('button')!.click();
      expect(close).toHaveBeenCalledWith(false);
    },
  );
});
