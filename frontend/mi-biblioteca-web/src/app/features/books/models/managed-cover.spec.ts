import { isManagedCover } from './managed-cover';

describe('managed cover UX classification', () => {
  const base = 'https://images.example.test:8443/library/covers';
  const name = '42-12345678-1234-abcd-1234-123456789abc';
  it.each(['jpg', 'png'])('should recognize exact owned %s references', (extension) => {
    expect(isManagedCover(`${base}/${name}.${extension}`, 42, base)).toBe(true);
    expect(isManagedCover(`${base}/${name}.${extension}`, 42, base + '///')).toBe(true);
  });
  it('should compare case-insensitive scheme/host and effective default ports', () => {
    expect(
      isManagedCover(
        `HTTPS://IMAGES.EXAMPLE.TEST:443/library/covers/${name}.png`,
        42,
        'https://images.example.test/library/covers',
      ),
    ).toBe(true);
    expect(
      isManagedCover(
        `http://localhost:80/api/covers/${name}.jpg`,
        42,
        'http://localhost/api/covers',
      ),
    ).toBe(true);
  });
  it.each([
    `https://other.test:8443/library/covers/${name}.png`,
    `http://images.example.test:8443/library/covers/${name}.png`,
    `https://images.example.test:8444/library/covers/${name}.png`,
    `${base}more/${name}.png`,
    `${base}/other/${name}.png`,
    `${base}/${name}.png/extra`,
    `${base}/43-12345678-1234-abcd-1234-123456789abc.png`,
    `${base}/${name.toUpperCase()}.png`,
    `${base}/42-invalid.png`,
    `${base}/${name}.webp`,
    `${base}/${name}.jpg.exe`,
    `${base}/${name}.png?x=1`,
    `${base}/${name}.png?`,
    `${base}/${name}.png#x`,
    `${base}/${name}.png#`,
    `https://user:pass@images.example.test:8443/library/covers/${name}.png`,
    `https://@images.example.test:8443/library/covers/${name}.png`,
    `${base}/../covers/${name}.png`,
    `${base}/%2e%2e/covers/${name}.png`,
    `${base}/%34%32-12345678-1234-abcd-1234-123456789abc.png`,
    ` ${base}/${name}.png`,
    `${base}\\${name}.png`,
    '/api/covers/file.png',
    'not a URL',
    '',
  ])('should reject non-owned or repaired reference %s', (url) =>
    expect(isManagedCover(url, 42, base)).toBe(false),
  );
  it.each([
    'ftp://images.example.test/covers',
    'https://user@images.example.test/covers',
    base + '?query',
    base + '#fragment',
    'invalid',
  ])('should fail closed on invalid configuration %s', (config) =>
    expect(isManagedCover(`${base}/${name}.png`, 42, config)).toBe(false),
  );
  it('should reject null, invalid IDs and normalized host aliases not accepted by backend ownership', () => {
    expect(isManagedCover(null, 42, base)).toBe(false);
    expect(isManagedCover(`${base}/${name}.png`, 0, base)).toBe(false);
    expect(isManagedCover(`http://127.1/covers/${name}.png`, 42, 'http://127.0.0.1/covers')).toBe(
      false,
    );
    expect(isManagedCover(`${base}/${name}.png`, 43, base)).toBe(false);
  });
});
