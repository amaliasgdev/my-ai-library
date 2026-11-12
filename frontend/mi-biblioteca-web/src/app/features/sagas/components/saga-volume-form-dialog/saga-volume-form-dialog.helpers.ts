import { MatDialogConfig } from '@angular/material/dialog';
import { SagaVolumeFormDialogData, SagaVolumeFormMode } from './saga-volume-form-dialog';
import { SagaVolume } from '../../models/saga.models';

export function sagaVolumeFormDialogConfig(
  mode: SagaVolumeFormMode,
  volume?: SagaVolume,
): MatDialogConfig<SagaVolumeFormDialogData> {
  return {
    data: { mode, volume },
    autoFocus: 'input',
    restoreFocus: true,
    ariaDescribedBy: 'saga-volume-form-help',
    width: '30rem',
    maxWidth: 'calc(100vw - 2rem)',
  };
}
