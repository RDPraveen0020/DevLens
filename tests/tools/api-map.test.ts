import { describe, it, expect } from 'vitest';
import { extractEndpoints, extractInjections, buildApiMap } from '../../tools/dl-api-map/scan.mjs';

describe('extractEndpoints', () => {
  it('extracts verb + path from this.http calls, dropping the base URL', () => {
    const code = `export class AnnouncementService {
      baseURL = environment.api;
      constructor(private http: HttpClient) {}
      getAll() { return this.http.get(this.baseURL + "Announcements/GetAll"); }
      add(i) { return this.http.post(this.baseURL + "Announcements/Add", i); }
      del(id) { return this.http.delete(this.baseURL + "Announcements/Delete/" + id); }
    }`;
    expect(extractEndpoints(code, '/p/announcement.service.ts')).toEqual([
      {
        className: 'AnnouncementService',
        endpoints: [
          { method: 'GET', path: 'Announcements/GetAll' },
          { method: 'POST', path: 'Announcements/Add' },
          { method: 'DELETE', path: 'Announcements/Delete/{param}' },
        ],
      },
    ]);
  });

  it('ignores non-http .get calls', () => {
    const code = `export class C { f(form) { return form.get("name"); } }`;
    expect(extractEndpoints(code, '/p/x.ts')).toEqual([]);
  });
});

describe('extractInjections', () => {
  it('returns the selector and injected constructor param type names', () => {
    const code = `@Component({ selector: 'app-x' })
    export class XComponent { constructor(private a: AnnouncementService, private r: Router) {} }`;
    expect(extractInjections(code, '/p/x.component.ts')).toEqual([
      { selector: 'app-x', serviceTypes: ['AnnouncementService', 'Router'] },
    ]);
  });
});

describe('buildApiMap', () => {
  it('maps a component selector to its injected services’ endpoints', () => {
    const files = [
      {
        fileName: '/p/announcement.service.ts',
        code: `export class AnnouncementService { constructor(private http: HttpClient){} a(){return this.http.get(this.baseURL + "Announcements/GetAll");} }`,
      },
      {
        fileName: '/p/x.component.ts',
        code: `@Component({ selector: 'app-x' }) export class XComponent { constructor(private a: AnnouncementService, private r: Router){} }`,
      },
    ];
    expect(buildApiMap(files)).toEqual({
      services: { AnnouncementService: [{ method: 'GET', path: 'Announcements/GetAll' }] },
      components: { 'app-x': ['AnnouncementService'] },
    });
  });
});
