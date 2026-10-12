import { TestBed } from '@angular/core/testing';
import { COVERS_CONFIG } from './covers.config';

describe('COVERS_CONFIG', () => {
  it('should match the development backend default without physical storage paths', () => {
    expect(TestBed.inject(COVERS_CONFIG)).toEqual({
      publicBaseUrl: 'http://localhost:8081/api/covers',
    });
  });
  it('should support an independently configured public origin and path', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: COVERS_CONFIG,
          useValue: { publicBaseUrl: 'https://images.example.test/library/covers' },
        },
      ],
    });
    expect(TestBed.inject(COVERS_CONFIG).publicBaseUrl).toBe(
      'https://images.example.test/library/covers',
    );
  });
});
