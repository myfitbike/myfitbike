import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

// With sign-in on, a plain <a href download> sends no token and the API answers 401, so "Export FIT" saved nothing.
// The file must come through fetch (which adds the token), and a refusal must be reported, not saved as a .fit file.
describe('Export FIT downloads through the signed-in fetch', () => {
  const clicked: { href: string; download: string }[] = [];
  const stub = (res: Response) => {
    vi.stubGlobal('fetch', vi.fn(async () => res));
    vi.stubGlobal('document', { createElement: () => { const a = { href: '', download: '', click: () => clicked.push({ href: a.href, download: a.download }) }; return a; } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fit'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  };
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); clicked.length = 0; });
  it('saves the file under the name the server gives', async () => {
    stub(new Response(new Uint8Array([14, 16]), { status: 200, headers: { 'content-disposition': 'attachment; filename="Harbour_Spin_38.fit"' } }));
    await api.downloadFit(38);
    expect(fetch).toHaveBeenCalledWith('/api/rides/38/fit'); expect(clicked).toEqual([{ href: 'blob:fit', download: 'Harbour_Spin_38.fit' }]);
  });
  it('reports a refused download instead of saving the error as a file', async () => {
    stub(new Response('{"error":"sign in required"}', { status: 401 }));
    await expect(api.downloadFit(38)).rejects.toThrow('FIT export failed (401)'); expect(clicked).toEqual([]);
  });
});
