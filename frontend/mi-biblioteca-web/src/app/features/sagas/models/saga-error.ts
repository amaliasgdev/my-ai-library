import { HttpErrorResponse } from '@angular/common/http';

export function sagaLoadError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) return 'La saga no existe';
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo cargar la saga';
  }
  return 'No se pudo cargar la saga';
}

export function sagaSaveError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status === 400) return 'Revisa los campos indicados';
    if (error.status === 404) return 'La saga ya no existe';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo guardar la saga';
  }
  return 'No se pudo guardar la saga';
}

export function sagaDeleteError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 409)
      return 'La saga ha cambiado. Se ha actualizado la información; revisa el estado y vuelve a intentar.';
    if (error.status === 404) return 'La saga ya no existe';
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status >= 500 && error.status < 600) return 'El servidor no pudo eliminar la saga';
  }
  return 'No se pudo eliminar la saga';
}

export function problemCode(problem: unknown): string | null {
  if (!problem || typeof problem !== 'object' || !('code' in problem)) return null;
  const code = problem.code;
  return typeof code === 'string' ? code : null;
}

export function sagaVolumeErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const code = problemCode(error.error);
    switch (code) {
      case 'SAGA_REVISION_CONFLICT':
        return 'La saga ha cambiado. Se ha actualizado la lista; revisa el estado y vuelve a intentar.';
      case 'SAGA_VOLUME_NOT_FOUND':
        return 'El volumen ya no existe. Se ha actualizado la lista.';
      case 'SAGA_BOOK_NOT_FOUND':
        return 'El libro ya no existe en la biblioteca.';
      case 'SAGA_VOLUME_ALREADY_CONTAINS_BOOK':
        return 'Ese libro ya forma parte de esta saga.';
      case 'SAGA_VOLUME_ALREADY_LINKED':
        return 'El volumen ya está vinculado a otro libro. Se ha actualizado la lista.';
      case 'SAGA_VOLUME_NOT_LINKED':
        return 'El volumen ya no está vinculado. Se ha actualizado la lista.';
      case 'SAGA_VOLUME_INVALID_POSITION':
        return 'La posición ya no es válida. Se ha actualizado la lista.';
      case 'SAGA_VOLUME_TARGET_REQUIRED':
      case 'SAGA_VOLUME_TARGET_CONFLICT':
        return 'Revisa el título y la etiqueta del volumen.';
      default:
        break;
    }
    if (error.status === 0) return 'No se puede conectar con el servidor';
    if (error.status === 404)
      return 'La saga o el volumen ya no existe. Se ha actualizado la lista.';
    if (error.status === 400) return 'Revisa los datos del volumen';
    if (error.status === 409) return 'No se pudo completar la operación por un conflicto de datos';
    if (error.status >= 500 && error.status < 600)
      return 'El servidor no pudo completar la operación';
  }
  return 'No se pudo completar la operación';
}

export function sagaVolumeRefreshRequired(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  if (error.status === 404) return true;
  return [
    'SAGA_REVISION_CONFLICT',
    'SAGA_VOLUME_NOT_FOUND',
    'SAGA_VOLUME_INVALID_POSITION',
    'SAGA_VOLUME_ALREADY_LINKED',
    'SAGA_VOLUME_NOT_LINKED',
  ].includes(problemCode(error.error) ?? '');
}
