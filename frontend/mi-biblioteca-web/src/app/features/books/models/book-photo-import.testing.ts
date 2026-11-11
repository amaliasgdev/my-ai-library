import { PhotoImportCapabilities, PhotoRecognitionResponse } from './book-photo-import.models';

export function testPhotoCapabilities(
  overrides: Partial<PhotoImportCapabilities> = {},
): PhotoImportCapabilities {
  return {
    enabled: false,
    provider: 'none',
    mode: 'DISABLED',
    simulated: false,
    allowedFormats: ['image/jpeg', 'image/png'],
    maxFileBytes: 5242880,
    maxWidth: 6000,
    maxHeight: 6000,
    maxPixels: 20000000,
    maxObservations: 25,
    maxConcurrentAnalyses: 1,
    analysisTimeoutMillis: 45000,
    ...overrides,
  };
}

export function testPhotoResult(title = 'Dune'): PhotoRecognitionResponse {
  return {
    requestId: 'test-request',
    provider: 'mock',
    simulated: true,
    observations: [
      {
        id: '1',
        visibleText: 'SIMULATED SAMPLE',
        title,
        author: 'Frank Herbert',
        rawIsbn: null,
        legibility: 'CLEAR',
        warnings: [],
      },
    ],
    incomplete: false,
    warnings: ['Fixed demonstration unrelated to uploaded photograph'],
  };
}
