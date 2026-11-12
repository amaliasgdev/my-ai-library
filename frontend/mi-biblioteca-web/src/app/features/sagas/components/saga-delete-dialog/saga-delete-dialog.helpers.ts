import { MatDialogConfig } from '@angular/material/dialog';
import { SagaDeleteDialogData } from './saga-delete-dialog';

export function sagaDeleteDialogConfig(name: string): MatDialogConfig<SagaDeleteDialogData> {
  return {
    data: { name },
    autoFocus: '.cancel-delete',
    restoreFocus: true,
    ariaDescribedBy: 'saga-delete-description',
    width: '28rem',
    maxWidth: 'calc(100vw - 2rem)',
  };
}
