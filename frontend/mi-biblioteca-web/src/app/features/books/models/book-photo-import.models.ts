export interface PhotoImportCapabilities {
  enabled: boolean;
  provider: string;
  mode: 'DISABLED' | 'SIMULATED';
  simulated: boolean;
  allowedFormats: string[];
  maxFileBytes: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  maxObservations: number;
  maxConcurrentAnalyses: number;
  analysisTimeoutMillis: number;
}

export interface PhotoObservation {
  id: string;
  visibleText: string | null;
  title: string | null;
  author: string | null;
  rawIsbn: string | null;
  legibility: 'CLEAR' | 'PARTIAL' | 'ILLEGIBLE';
  warnings: string[];
}

export interface PhotoRecognitionResponse {
  requestId: string;
  provider: string;
  simulated: boolean;
  observations: PhotoObservation[];
  incomplete: boolean;
  warnings: string[];
}
