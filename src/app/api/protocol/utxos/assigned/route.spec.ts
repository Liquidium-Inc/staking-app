import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /api/protocol/utxos/assigned', () => {
  it('does not expose production Redis diagnostics', async () => {
    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
});
