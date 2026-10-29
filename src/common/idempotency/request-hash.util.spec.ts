import { hashRequestBody } from './request-hash.util';

describe('hashRequestBody', () => {
  it('produces the same hash regardless of JSON key order', () => {
    const first = hashRequestBody({ amount: '10', currency: 'cNGN' });
    const second = hashRequestBody({ currency: 'cNGN', amount: '10' });
    expect(first).toBe(second);
  });

  it('depends on nested values too', () => {
    const first = hashRequestBody({ body: { from: 'cNGN', to: 'USDx' } });
    const second = hashRequestBody({ body: { to: 'USDx', from: 'cNGN' } });
    expect(first).toBe(second);
  });

  it('changes when the body differs', () => {
    const first = hashRequestBody({ amount: '10' });
    const second = hashRequestBody({ amount: '11' });
    expect(first).not.toBe(second);
  });

  it('is a sha256 hex digest', () => {
    expect(hashRequestBody({})).toMatch(/^[a-f0-9]{64}$/);
  });
});
