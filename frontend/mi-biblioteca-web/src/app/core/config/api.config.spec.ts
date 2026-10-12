import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { appConfig } from '../../app.config';
import { API_CONFIG } from './api.config';

describe('HTTP infrastructure', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    }),
  );

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('should expose a single relative API base URL', () => {
    expect(TestBed.inject(API_CONFIG).apiBaseUrl).toBe('/api');
  });

  it('should provide HttpClient and allow tests without a running backend', () => {
    const baseUrl = TestBed.inject(API_CONFIG).apiBaseUrl;
    let result: unknown;
    TestBed.inject(HttpClient)
      .get<unknown>(`${baseUrl}/infrastructure-test`)
      .subscribe((value) => (result = value));
    const request = TestBed.inject(HttpTestingController).expectOne('/api/infrastructure-test');
    expect(request.request.method).toBe('GET');
    request.flush({ ready: true });
    expect(result).toEqual({ ready: true });
  });
});
