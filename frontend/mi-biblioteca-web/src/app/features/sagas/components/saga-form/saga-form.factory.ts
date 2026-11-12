import { FormControl, FormGroup, Validators } from '@angular/forms';
import { notBlank } from './saga-form.validators';
import { httpImageUrl } from './saga-form.validators';

export function createSagaForm() {
  return new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(255)],
    }),
    author: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(255)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    imageUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2048), httpImageUrl],
    }),
  });
}

export type SagaFormGroup = ReturnType<typeof createSagaForm>;
