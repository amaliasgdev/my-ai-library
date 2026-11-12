import { collectionPercent, progressPercent, readingPercent } from './saga-progress';
import { testSagaProgress } from './saga.testing';

describe('saga progress percentages', () => {
  it('rounds and clamps percentages with a zero-safe denominator', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 20)).toBe(25);
    expect(progressPercent(20, 20)).toBe(100);
    expect(progressPercent(-1, 20)).toBe(0);
    expect(progressPercent(30, 20)).toBe(100);
    expect(progressPercent(Number.NaN, 20)).toBe(0);
  });

  it('separates collection coverage from reading progress', () => {
    const progress = testSagaProgress({ total: 5, linked: 3, pending: 2, read: 1 });
    expect(collectionPercent(progress)).toBe(60);
    expect(readingPercent(progress)).toBe(20);
  });
});
