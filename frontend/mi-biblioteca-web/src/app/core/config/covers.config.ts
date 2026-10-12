import { InjectionToken } from '@angular/core';

export interface CoversConfig {
  readonly publicBaseUrl: string;
}

// Must match backend COVERS_PUBLIC_BASE_URL, including its public origin and path.
export const COVERS_CONFIG = new InjectionToken<CoversConfig>('COVERS_CONFIG', {
  providedIn: 'root',
  factory: () => ({ publicBaseUrl: 'http://localhost:8081/api/covers' }),
});
