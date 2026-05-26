import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { FileSources } from 'librechat-data-provider';
import fileSchema from './file';

describe('File schema — MCP metadata', () => {
  let mongod: MongoMemoryServer;
  let FileModel: mongoose.Model<unknown>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    FileModel = mongoose.model('FileMcpTest', fileSchema);
    await FileModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('persists nested mcpResource metadata round-trip', async () => {
    const userId = new mongoose.Types.ObjectId();
    const doc = await FileModel.create({
      user: userId,
      file_id: 'f-1',
      bytes: 10,
      filename: 'README.md',
      filepath: '/tmp/x',
      object: 'file',
      type: 'text/markdown',
      source: FileSources.mcp,
      metadata: {
        mcpServerName: 'filesystem',
        mcpResource: {
          uri: 'file:///README.md',
          name: 'README.md',
          title: 'Project README',
          mimeType: 'text/markdown',
        },
        mcpLastIndexedAt: new Date(),
      },
    });
    const found = await FileModel.findById(doc._id).lean();
    expect(found?.metadata?.mcpResource?.uri).toBe('file:///README.md');
    expect(found?.metadata?.mcpResource?.title).toBe('Project README');
    expect(found?.metadata?.mcpServerName).toBe('filesystem');
  });

  it('enforces unique (user, mcpServerName, mcpResource.uri) for source=mcp', async () => {
    const userId = new mongoose.Types.ObjectId();
    const baseDoc = {
      user: userId,
      file_id: 'f-2a',
      bytes: 10,
      filename: 'a.md',
      filepath: '/tmp/a',
      object: 'file',
      type: 'text/markdown',
      source: FileSources.mcp,
      metadata: {
        mcpServerName: 'filesystem',
        mcpResource: { uri: 'file:///dup.md', name: 'dup.md' },
      },
    };
    await FileModel.create(baseDoc);
    await expect(
      FileModel.create({ ...baseDoc, file_id: 'f-2b' }),
    ).rejects.toThrow(/E11000/);
  });

  it('allows duplicate URIs across different users', async () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    const make = (user: mongoose.Types.ObjectId, file_id: string) => ({
      user,
      file_id,
      bytes: 1,
      filename: 'x',
      filepath: '/tmp/x',
      object: 'file',
      type: 'text/plain',
      source: FileSources.mcp,
      metadata: {
        mcpServerName: 's',
        mcpResource: { uri: 'file:///shared.md', name: 'shared.md' },
      },
    });
    await FileModel.create(make(userA, 'fa'));
    await expect(FileModel.create(make(userB, 'fb'))).resolves.toBeTruthy();
  });
});
