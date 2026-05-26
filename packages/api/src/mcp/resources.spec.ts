import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { startFixtureServer } from './__fixtures__/testServer';
import { listServerResources } from './resources';

describe('listServerResources', () => {
  it('returns the resources reported by the server (no cursor)', async () => {
    const fx = await startFixtureServer([
      { uri: 'file:///a.md', name: 'a.md', mimeType: 'text/markdown', content: { kind: 'text', text: 'A' } },
      { uri: 'file:///b.md', name: 'b.md', mimeType: 'text/markdown', content: { kind: 'text', text: 'B' } },
    ]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    const result = await listServerResources({ client, cursor: undefined });

    expect(result.resources.map((r) => r.uri)).toEqual(['file:///a.md', 'file:///b.md']);
    expect(result.nextCursor).toBeUndefined();
    await client.close();
    await fx.close();
  });
});
