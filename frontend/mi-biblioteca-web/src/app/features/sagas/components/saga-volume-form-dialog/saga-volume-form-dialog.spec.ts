import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog } from '@angular/material/dialog';
import { testPendingSagaVolume, testSagaVolume } from '../../models/saga.testing';
import { SagaVolume } from '../../models/saga.models';
import {
  SagaVolumeFormDialog,
  SagaVolumeFormDialogData,
  SagaVolumeFormDialogResult,
} from './saga-volume-form-dialog';
import { sagaVolumeFormDialogConfig } from './saga-volume-form-dialog.helpers';

@Component({ template: '<button type="button">Abrir</button>' })
class Host {}

describe('SagaVolumeFormDialog', () => {
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

  function open(mode: 'add-pending' | 'edit', volume: SagaVolume | undefined = undefined) {
    const ref = TestBed.inject(MatDialog).open<
      SagaVolumeFormDialog,
      SagaVolumeFormDialogData,
      SagaVolumeFormDialogResult
    >(SagaVolumeFormDialog, sagaVolumeFormDialogConfig(mode, volume));
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    return { ref, closed, dialog: ref.componentInstance };
  }

  it('requires a provisional title for a pending volume and normalizes the result', async () => {
    const { ref, closed, dialog } = open('add-pending');
    expect(dialog.form.controls.pendingTitle.hasError('required')).toBe(true);
    dialog.form.patchValue({ pendingTitle: '  Precuela  ', volumeLabel: '  0.5  ' });
    dialog.submit();
    await vi.waitFor(() =>
      expect(closed).toHaveBeenCalledWith({ pendingTitle: 'Precuela', volumeLabel: '0.5' }),
    );
    expect(ref).toBeTruthy();
  });

  it('only allows editing the label of a linked volume', async () => {
    const linked = testSagaVolume({ volumeLabel: '1' });
    const { closed, dialog } = open('edit', linked);
    expect(dialog.isPending).toBe(false);
    expect(dialog.form.controls.pendingTitle.value).toBe('');
    dialog.form.controls.volumeLabel.setValue(' 2 ');
    dialog.submit();
    await vi.waitFor(() =>
      expect(closed).toHaveBeenCalledWith({ pendingTitle: null, volumeLabel: '2' }),
    );
  });

  it('preloads and updates a pending volume title', async () => {
    const pending = testPendingSagaVolume({ pendingTitle: 'Antiguo', volumeLabel: '0.5' });
    const { closed, dialog } = open('edit', pending);
    expect(dialog.form.getRawValue()).toEqual({
      pendingTitle: 'Antiguo',
      volumeLabel: '0.5',
    });
    dialog.form.controls.pendingTitle.setValue('Nuevo');
    dialog.form.controls.volumeLabel.setValue('');
    dialog.submit();
    await vi.waitFor(() =>
      expect(closed).toHaveBeenCalledWith({ pendingTitle: 'Nuevo', volumeLabel: null }),
    );
  });

  it('does not emit a result when cancelled', async () => {
    const { closed, dialog } = open('add-pending');
    dialog.cancel();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith(undefined));
  });
});
