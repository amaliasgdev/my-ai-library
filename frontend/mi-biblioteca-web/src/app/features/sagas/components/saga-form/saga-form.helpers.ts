import { SagaRequest, SagaResponse } from '../../models/saga.models';

export interface SagaFormValue {
  name: string;
  author: string;
  description: string;
  imageUrl: string;
}

export function sagaFormValue(saga: SagaResponse): SagaFormValue {
  return {
    name: saga.name,
    author: saga.author ?? '',
    description: saga.description ?? '',
    imageUrl: saga.imageUrl ?? '',
  };
}

export function buildSagaRequest(value: SagaFormValue): SagaRequest {
  const optional = (text: string): string | null => {
    const trimmed = text.trim();
    return trimmed ? trimmed : null;
  };
  return {
    name: value.name.trim(),
    author: optional(value.author),
    description: optional(value.description),
    imageUrl: value.imageUrl === '' ? null : value.imageUrl,
  };
}
