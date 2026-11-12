import { MatDialogConfig } from '@angular/material/dialog';
import { SagaBookPickerDialogData } from './saga-book-picker-dialog';

export function sagaBookPickerDialogConfig(
  data: SagaBookPickerDialogData,
): MatDialogConfig<SagaBookPickerDialogData> {
  return {
    data,
    autoFocus: 'input',
    restoreFocus: true,
    ariaDescribedBy: 'saga-book-picker-help',
    width: '42rem',
    maxWidth: 'calc(100vw - 2rem)',
  };
}
