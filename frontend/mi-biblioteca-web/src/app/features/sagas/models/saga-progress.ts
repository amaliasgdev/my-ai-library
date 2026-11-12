import { SagaProgress } from './saga.models';

/** Rounded percentage with safe boundaries; an empty saga is always 0%. */
export function progressPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}

export function collectionPercent(progress: SagaProgress): number {
  return progressPercent(progress.linked, progress.total);
}

export function readingPercent(progress: SagaProgress): number {
  return progressPercent(progress.read, progress.total);
}
