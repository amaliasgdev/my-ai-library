import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { SagaDeleteDialog } from './saga-delete-dialog';
import { sagaDeleteDialogConfig } from './saga-delete-dialog.helpers';

@Component({ template: '<button type="button">Abrir</button>' })
class DialogHost {}

describe('SagaDeleteDialog', () => {
  let fixture: ComponentFixture<DialogHost>;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DialogHost] });
    fixture = TestBed.createComponent(DialogHost);
    fixture.detectChanges();
    opener = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    opener.focus();
  });

  async function open() {
    const ref = TestBed.inject(MatDialog).open<SagaDeleteDialog, { name: string }, boolean>(
      SagaDeleteDialog,
      {
        ...sagaDeleteDialogConfig('Nacidos de la bruma'),
        enterAnimationDuration: 0,
        exitAnimationDuration: 0,
      },
    );
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const dialog = await loader.getHarness(MatDialogHarness);
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Cancelar'));
    return { ref, closed, loader, dialog };
  }

  it('explains the scope, focuses Cancelar and returns false when cancelled', async () => {
    const { ref, closed, loader } = await open();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Eliminar saga');
    expect(dialog.textContent).toContain('¿Seguro que quieres eliminar «Nacidos de la bruma»?');
    expect(dialog.textContent).toContain('no se eliminarán los libros del catálogo');
    expect(dialog.textContent).toContain('Esta acción no se puede deshacer.');
    expect(dialog.getAttribute('aria-describedby')).toBe('saga-delete-description');
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Cancelar' }))).click();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(false));
    expect(ref).toBeTruthy();
  });

  it('returns true only after explicit confirmation', async () => {
    const { closed, loader } = await open();
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Eliminar saga' }))).click();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(true));
  });
});
