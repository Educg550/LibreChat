import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { startFixtureServer } from './__fixtures__/testServer';
import { listServerResources, readResource } from './resources';

describe('listServerResources', () => {
  it('returns the resources reported by the server (no cursor)', async () => {
    const fx = await startFixtureServer([
      {
        uri: 'file:///a.md',
        name: 'a.md',
        mimeType: 'text/markdown',
        content: { kind: 'text', text: 'A' },
      },
      {
        uri: 'file:///b.md',
        name: 'b.md',
        mimeType: 'text/markdown',
        content: { kind: 'text', text: 'B' },
      },
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

describe('readResource', () => {
  it('returns text content for a text resource', async () => {
    const fx = await startFixtureServer([
      { uri: 'file:///a.md', name: 'a.md', mimeType: 'text/markdown', content: { kind: 'text', text: 'hello' } },
    ]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    const result = await readResource({ client, uri: 'file:///a.md' });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({
      uri: 'file:///a.md',
      mimeType: 'text/markdown',
      text: 'hello',
    });
    await client.close();
    await fx.close();
  });

  it('returns blob content for a binary resource', async () => {
    const fx = await startFixtureServer([
      {
        uri: 'file:///pic.png',
        name: 'pic.png',
        mimeType: 'image/png',
        content: { kind: 'blob', base64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') },
      },
    ]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    const result = await readResource({ client, uri: 'file:///pic.png' });

    expect(result.contents[0]).toMatchObject({
      uri: 'file:///pic.png',
      mimeType: 'image/png',
    });
    expect((result.contents[0] as { blob?: string }).blob).toBeDefined();
    await client.close();
    await fx.close();
  });

  it('propagates -32602 when resource is missing', async () => {
    const fx = await startFixtureServer([]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    await expect(readResource({ client, uri: 'file:///nope' })).rejects.toMatchObject({
      code: -32602,
    });
    await client.close();
    await fx.close();
  });
});
