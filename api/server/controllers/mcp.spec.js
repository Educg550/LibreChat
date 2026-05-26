jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  listServerResources: jest.fn(),
  ingestResource: jest.fn(),
  refreshResource: jest.fn(),
  MCPErrorCodes: {},
  redactServerSecrets: jest.fn((v) => v),
  redactAllServerSecrets: jest.fn((v) => v),
  isMCPDomainNotAllowedError: jest.fn(() => false),
  isMCPInspectionFailedError: jest.fn(() => false),
}));
jest.mock('librechat-data-provider', () => ({
  Constants: { mcp_delimiter: '_mcp_' },
  MCPServerUserInputSchema: { parse: jest.fn() },
}));
jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: jest.fn(),
  resolveMcpConfigNames: jest.fn(),
  resolveAllMcpConfigs: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({
  cacheMCPServerTools: jest.fn(),
  getMCPServerTools: jest.fn(),
}));
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getMCPServersRegistry: jest.fn(),
}));
jest.mock('~/models', () => ({
  addAgentResourceFile: jest.fn(),
}));
jest.mock('~/db/models', () => ({
  File: { __mock: true },
}));
jest.mock('~/server/services/Files/mcpUploadAdapter', () => ({
  createMCPUploadAdapter: jest.fn(() => 'mock-upload-adapter'),
}));

const { getMCPManager } = require('~/config');
const { listServerResources, ingestResource, refreshResource } = require('@librechat/api');
const { addAgentResourceFile } = require('~/models');
const { createMCPUploadAdapter } = require('~/server/services/Files/mcpUploadAdapter');
const { getMCPResources, attachMCPResource, refreshMCPResource } = require('./mcp');

describe('getMCPResources', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: 'user-1' },
      params: { serverName: 'fs' },
      query: {},
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('returns 401 when no user', async () => {
    req.user = null;
    await getMCPResources(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 404 RESOURCES_UNSUPPORTED when the server lacks the resources capability', async () => {
    getMCPManager.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue({
        client: { getServerCapabilities: () => ({ tools: {} }) },
      }),
    });
    await getMCPResources(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 'RESOURCES_UNSUPPORTED', serverName: 'fs' });
  });

  it('returns resources from listServerResources with cursor passthrough', async () => {
    const fakeClient = { getServerCapabilities: () => ({ resources: { listChanged: true } }) };
    getMCPManager.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue({ client: fakeClient }),
    });
    listServerResources.mockResolvedValue({
      resources: [{ uri: 'file:///a', name: 'a' }],
      nextCursor: 'cur-2',
    });
    req.query.cursor = 'cur-1';

    await getMCPResources(req, res);

    expect(listServerResources).toHaveBeenCalledWith({ client: fakeClient, cursor: 'cur-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      resources: [{ uri: 'file:///a', name: 'a' }],
      nextCursor: 'cur-2',
    });
  });

  it('maps -32602 INVALID_CURSOR to HTTP 400', async () => {
    const fakeClient = { getServerCapabilities: () => ({ resources: {} }) };
    getMCPManager.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue({ client: fakeClient }),
    });
    const err = Object.assign(new Error('Invalid cursor'), { code: -32602 });
    listServerResources.mockRejectedValue(err);

    await getMCPResources(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('attachMCPResource', () => {
  let req, res, fakeClient;
  beforeEach(() => {
    jest.clearAllMocks();
    fakeClient = { getServerCapabilities: () => ({ resources: {} }) };
    req = {
      user: { id: 'user-1' },
      params: { serverName: 'fs' },
      body: { uri: 'file:///a.md', agentId: 'agent-1' },
      config: { fileStrategy: 'local' },
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    getMCPManager.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue({ client: fakeClient }),
    });
  });

  it('returns 401 when no user', async () => {
    req.user = null;
    await attachMCPResource(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when uri or agentId missing', async () => {
    req.body = {};
    await attachMCPResource(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 RESOURCES_UNSUPPORTED if server lacks capability', async () => {
    fakeClient.getServerCapabilities = () => ({});
    await attachMCPResource(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 'RESOURCES_UNSUPPORTED', serverName: 'fs' });
  });

  it('ingests resource and appends file_id to agent file_search', async () => {
    ingestResource.mockResolvedValue({ file_id: 'f-1', created: true, userId: 'user-1' });
    addAgentResourceFile.mockResolvedValue({});

    await attachMCPResource(req, res);

    expect(createMCPUploadAdapter).toHaveBeenCalledWith(req.config);
    expect(ingestResource).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        serverName: 'fs',
        uri: 'file:///a.md',
        client: fakeClient,
        uploadAdapter: 'mock-upload-adapter',
        fileModel: expect.anything(),
      }),
    );
    expect(addAgentResourceFile).toHaveBeenCalledWith({
      agent_id: 'agent-1',
      tool_resource: 'file_search',
      file_id: 'f-1',
      updatingUserId: 'user-1',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ file_id: 'f-1', created: true });
  });

  it('returns 200 created=false when ingestResource dedupes existing file', async () => {
    ingestResource.mockResolvedValue({ file_id: 'f-existing', created: false, userId: 'user-1' });
    addAgentResourceFile.mockResolvedValue({});

    await attachMCPResource(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ file_id: 'f-existing', created: false });
    expect(addAgentResourceFile).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: 'f-existing' }),
    );
  });

  it('maps -32002 RESOURCE_NOT_FOUND to 404', async () => {
    ingestResource.mockRejectedValue(Object.assign(new Error('not found'), { code: -32002 }));
    await attachMCPResource(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('maps -32603 INTERNAL_ERROR to 502', async () => {
    ingestResource.mockRejectedValue(Object.assign(new Error('boom'), { code: -32603 }));
    await attachMCPResource(req, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe('refreshMCPResource', () => {
  let req, res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: 'user-1' },
      params: { serverName: 'fs' },
      body: { uri: 'file:///a.md' },
      config: { fileStrategy: 'local' },
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    getMCPManager.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue({
        client: { getServerCapabilities: () => ({ resources: {} }) },
      }),
    });
  });

  it('400 when uri is missing', async () => {
    req.body = {};
    await refreshMCPResource(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns refresh result on success', async () => {
    const now = new Date();
    refreshResource.mockResolvedValue({ file_id: 'f-1', lastIndexedAt: now, status: 'refreshed' });
    await refreshMCPResource(req, res);
    expect(refreshResource).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      file_id: 'f-1',
      lastIndexedAt: now,
      status: 'refreshed',
    });
  });

  it('maps status=403 errors from refreshResource to HTTP 403', async () => {
    refreshResource.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await refreshMCPResource(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
