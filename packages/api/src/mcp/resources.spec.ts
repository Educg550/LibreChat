import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { IMongoFile } from '@librechat/data-schemas';
import { startFixtureServer } from './__fixtures__/testServer';
import { listServerResources, readResource, ingestResource, refreshResource } from './resources';

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
      {
        uri: 'file:///a.md',
        name: 'a.md',
        mimeType: 'text/markdown',
        content: { kind: 'text', text: 'hello' },
      },
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

describe('ingestResource', () => {
  let mongod: MongoMemoryServer;
  let TestFileModel: mongoose.Model<IMongoFile>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    const schema = new mongoose.Schema<IMongoFile>({
      user: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
      file_id: { type: String, required: true, index: true },
      bytes: { type: Number, required: true },
      filename: { type: String, required: true },
      filepath: { type: String, required: true },
      object: { type: String, required: true, default: 'file' },
      type: { type: String, required: true },
      source: { type: String, required: true },
      embedded: Boolean,
      status: String,
      usage: { type: Number, required: true, default: 0 },
      metadata: { type: mongoose.Schema.Types.Mixed },
    });
    TestFileModel = mongoose.model<IMongoFile>('IngestResourceTestFile', schema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates a new File on first call and re-uses it on second call (dedupe)', async () => {
    const fx = await startFixtureServer([
      {
        uri: 'file:///d.md',
        name: 'd.md',
        mimeType: 'text/markdown',
        content: { kind: 'text', text: 'dup' },
      },
    ]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    let callIndex = 0;
    const uploadSpy = jest.fn().mockImplementation(async ({ buffer, filename }) => ({
      file_id: `f-${callIndex++}`,
      bytes: buffer.length,
      filepath: `/tmp/${filename}`,
      embedded: true,
    }));

    const userId = new mongoose.Types.ObjectId().toString();
    const a = await ingestResource({
      userId,
      serverName: 'fs',
      uri: 'file:///d.md',
      client,
      uploadAdapter: uploadSpy,
      fileModel: TestFileModel,
    });
    const aAgain = await ingestResource({
      userId,
      serverName: 'fs',
      uri: 'file:///d.md',
      client,
      uploadAdapter: uploadSpy,
      fileModel: TestFileModel,
    });

    expect(a.file_id).toBe(aAgain.file_id);
    expect(a.created).toBe(true);
    expect(aAgain.created).toBe(false);
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    await client.close();
    await fx.close();
  });

  it('decodes binary content via Buffer.from(blob, "base64") before handing off', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fx = await startFixtureServer([
      {
        uri: 'file:///b.png',
        name: 'b.png',
        mimeType: 'image/png',
        content: { kind: 'blob', base64: bytes.toString('base64') },
      },
    ]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    const uploadSpy = jest.fn().mockImplementation(async ({ buffer }) => ({
      file_id: 'f-bin',
      bytes: buffer.length,
      filepath: '/tmp/b.png',
      embedded: false,
    }));

    const userId = new mongoose.Types.ObjectId().toString();
    await ingestResource({
      userId,
      serverName: 'fs',
      uri: 'file:///b.png',
      client,
      uploadAdapter: uploadSpy,
      fileModel: TestFileModel,
    });

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    const call = uploadSpy.mock.calls[0][0];
    expect(Buffer.isBuffer(call.buffer)).toBe(true);
    expect(call.buffer.equals(bytes)).toBe(true);
    expect(call.mimeType).toBe('image/png');

    await client.close();
    await fx.close();
  });
});

describe('refreshResource', () => {
  let mongod2: MongoMemoryServer;
  let TestFileModel2: mongoose.Model<IMongoFile>;

  beforeAll(async () => {
    if (!mongoose.connection.readyState) {
      mongod2 = await MongoMemoryServer.create();
      await mongoose.connect(mongod2.getUri());
    }
    const schema = new mongoose.Schema<IMongoFile>({
      user: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
      file_id: { type: String, required: true, index: true },
      bytes: { type: Number, required: true },
      filename: { type: String, required: true },
      filepath: { type: String, required: true },
      object: { type: String, required: true, default: 'file' },
      type: { type: String, required: true },
      source: { type: String, required: true },
      embedded: Boolean,
      status: String,
      usage: { type: Number, required: true, default: 0 },
      metadata: { type: mongoose.Schema.Types.Mixed },
    });
    TestFileModel2 = mongoose.model<IMongoFile>('RefreshResourceTestFile', schema);
  });

  afterAll(async () => {
    if (mongod2) {
      await mongoose.disconnect();
      await mongod2.stop();
    }
  });

  it('refreshes content + updates mcpLastIndexedAt; returns status=refreshed', async () => {
    const fx = await startFixtureServer([
      {
        uri: 'file:///r.md',
        name: 'r.md',
        mimeType: 'text/markdown',
        content: { kind: 'text', text: 'v1' },
      },
    ]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    const userId = new mongoose.Types.ObjectId().toString();
    const initial = await TestFileModel2.create({
      user: userId,
      file_id: 'fid-r',
      bytes: 2,
      filename: 'r.md',
      filepath: '/tmp/r.md',
      object: 'file',
      type: 'text/markdown',
      source: 'mcp',
      status: 'ready',
      usage: 0,
      metadata: {
        mcpServerName: 'fs',
        mcpResource: { uri: 'file:///r.md', name: 'r.md', mimeType: 'text/markdown', size: 2 },
        mcpLastIndexedAt: new Date(Date.now() - 60_000),
      },
    });

    fx.setResources([
      {
        uri: 'file:///r.md',
        name: 'r.md',
        mimeType: 'text/markdown',
        content: { kind: 'text', text: 'v2-bigger' },
      },
    ]);

    const uploadSpy = jest.fn().mockImplementation(async ({ buffer }) => ({
      file_id: 'fid-r',
      bytes: buffer.length,
      filepath: '/tmp/r.md',
      embedded: true,
    }));

    const result = await refreshResource({
      userId,
      serverName: 'fs',
      uri: 'file:///r.md',
      client,
      uploadAdapter: uploadSpy,
      fileModel: TestFileModel2,
    });

    expect(result.status).toBe('refreshed');
    expect(result.file_id).toBe('fid-r');
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    const reloaded = await TestFileModel2.findById(initial._id).lean<IMongoFile | null>();
    expect(reloaded?.bytes).toBe('v2-bigger'.length);
    const reloadedMetadata = reloaded?.metadata as { mcpLastIndexedAt: Date } | undefined;
    const initialMetadata = initial.metadata as unknown as { mcpLastIndexedAt: Date };
    expect(new Date(reloadedMetadata!.mcpLastIndexedAt).getTime()).toBeGreaterThan(
      new Date(initialMetadata.mcpLastIndexedAt).getTime(),
    );

    await client.close();
    await fx.close();
  });

  it('throws status=403 when no matching File for this user/server/uri exists', async () => {
    const fx = await startFixtureServer([
      {
        uri: 'file:///x.md',
        name: 'x.md',
        mimeType: 'text/markdown',
        content: { kind: 'text', text: 'x' },
      },
    ]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    const userId = new mongoose.Types.ObjectId().toString();
    const noop = jest.fn();

    await expect(
      refreshResource({
        userId,
        serverName: 'fs',
        uri: 'file:///x.md',
        client,
        uploadAdapter: noop,
        fileModel: TestFileModel2,
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(noop).not.toHaveBeenCalled();

    await client.close();
    await fx.close();
  });
});
