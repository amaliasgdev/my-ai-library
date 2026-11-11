import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

export const photoImportCanDeactivate: CanDeactivateFn<{
  canLeave(): boolean | Observable<boolean>;
}> = (component) => component.canLeave();
