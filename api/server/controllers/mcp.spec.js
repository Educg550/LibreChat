jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  listServerResources: jest.fn(),
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

const { getMCPManager } = require('~/config');
const { listServerResources } = require('@librechat/api');
const { getMCPResources } = require('./mcp');

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
