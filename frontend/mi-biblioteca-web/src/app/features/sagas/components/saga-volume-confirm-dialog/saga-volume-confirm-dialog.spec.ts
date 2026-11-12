import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { SagaVolumeConfirmDialog, SagaVolumeConfirmDialogData } from './saga-volume-confirm-dialog';
import { sagaVolumeConfirmDialogConfig } from './saga-volume-confirm-dialog.helpers';

@Component({ template: '<button type="button">Abrir</button>' })
class Host {}

describe('SagaVolumeConfirmDialog', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: MAT_DIALOG_DEFAULT_OPTIONS,
          useValue: { enterAnimationDuration: 0, exitAnimationDuration: 0 },
        },
      ],
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  function open(mode: 'remove' | 'unlink', title: string) {
    const ref = TestBed.inject(MatDialog).open<
      SagaVolumeConfirmDialog,
      SagaVolumeConfirmDialogData,
      boolean
    >(SagaVolumeConfirmDialog, sagaVolumeConfirmDialogConfig(mode, title));
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    return { ref, closed };
  }

  it('explains that removing a volume keeps the book and returns false on cancel', async () => {
    const { closed, ref } = open('remove', 'El imperio final');
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const dialog = await loader.getHarness(MatDialogHarness);
    const text = await dialog.getText();
    expect(text).toContain('Quitar volumen de la saga');
    expect(text).toContain('El libro seguirá en la biblioteca');
    expect(text).toContain('las posiciones posteriores se compactarán');
    ref.close(false);
    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(false));
  });

  it('explains unlinking and returns true on confirmation', async () => {
    const { closed, ref } = open('unlink', 'El pozo de la ascensión');
    const loader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const dialog = await loader.getHarness(MatDialogHarness);
    const text = await dialog.getText();
    expect(text).toContain('Desvincular libro');
    expect(text).toContain('seguirá en la saga como pendiente');
    expect(text).toContain('El libro seguirá en la biblioteca');
    ref.close(true);
    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(true));
  });
});
