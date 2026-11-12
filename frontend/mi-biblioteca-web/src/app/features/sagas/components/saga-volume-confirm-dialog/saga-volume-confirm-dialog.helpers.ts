import { MatDialogConfig } from '@angular/material/dialog';
import { SagaVolumeConfirmDialogData, SagaVolumeConfirmMode } from './saga-volume-confirm-dialog';

export function sagaVolumeConfirmDialogConfig(
  mode: SagaVolumeConfirmMode,
  volumeTitle: string,
): MatDialogConfig<SagaVolumeConfirmDialogData> {
  return {
    data: { mode, volumeTitle },
    autoFocus: '.cancel-action',
    restoreFocus: true,
    ariaDescribedBy: 'saga-volume-confirm-description',
    width: '30rem',
    maxWidth: 'calc(100vw - 2rem)',
  };
}
