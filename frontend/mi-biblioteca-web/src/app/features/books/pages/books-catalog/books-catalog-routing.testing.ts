import { inject, Provider } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { parseBookCatalogQuery, serializeBookCatalogQuery } from '../../models/book-catalog-query';

// Old page fixtures must now establish their requested URL, not change pagination
// implicitly by returning a response for a different page/size.
export function setCatalogPageTesting(page: number, size = 20): void {
  const route = TestBed.inject(ActivatedRoute);
  const query = parseBookCatalogQuery(route.snapshot.queryParamMap);
  if (query.page === page && query.size === size) return;
  const old = TestBed.inject(HttpTestingController).match((req) => req.method === 'GET');
  void TestBed.inject(Router).navigate(['/books'], {
    queryParams: serializeBookCatalogQuery({ ...query, page, size }),
  });
  for (const request of old) {
    if (!request.cancelled) throw new Error('Previous catalog GET was not canceled');
  }
}

// Synchronous Router boundary for existing isolated HTTP/write regressions.
// Full URL/history/canonicalization behavior is exercised separately with the real Router.
export function provideCatalogRoutingTesting(): Provider {
  return {
    provide: ActivatedRoute,
    useFactory: () => {
      const router = inject(Router);
      const route = router.routerState.root;
      const params = new BehaviorSubject(convertToParamMap({}));
      Object.defineProperty(route, 'queryParamMap', { value: params.asObservable() });
      const navigate = router.navigate.bind(router);
      router.navigate = (commands, extras) => {
        if (commands.length === 1 && commands[0] === '/books' && extras?.queryParams) {
          const next = convertToParamMap(extras.queryParams);
          Object.defineProperty(route.snapshot, 'queryParamMap', {
            value: next,
            configurable: true,
          });
          params.next(next);
          return Promise.resolve(true);
        }
        return navigate(commands, extras);
      };
      return route;
    },
  };
}
