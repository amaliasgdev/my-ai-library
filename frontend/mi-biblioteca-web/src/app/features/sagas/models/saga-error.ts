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
