import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type * as t from './types';
import { startFixtureServer } from './__fixtures__/testServer';
import { MCPManager } from './MCPManager';

jest.mock('~/mcp/registry/MCPServersInitializer', () => ({
  MCPServersInitializer: {
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('listChanged tracking', () => {
  beforeEach(() => {
    (MCPManager as unknown as { instance: MCPManager | null }).instance = null;
  });

  it('round-trips notifications/resources/list_changed through the SDK to a notification handler', async () => {
    const fx = await startFixtureServer([]);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    await client.connect(fx.clientTransport);

    let observed = 0;
    const handled = new Promise<void>((resolve) => {
      client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
        observed = Date.now();
        resolve();
      });
    });

    await fx.emitListChanged();
    await handled;

    expect(observed).toBeGreaterThan(0);

    await client.close();
    await fx.close();
  });

  it('MCPManager.markListChanged + getLastListChangeForUser round-trip', async () => {
    const configs: t.MCPServers = {};
    const mgr = await MCPManager.createInstance(configs);

    const userId = `test-user-${Date.now()}`;
    mgr.markListChanged(userId, 'srv');

    const map = mgr.getLastListChangeForUser(userId);
    expect(map.srv).toBeGreaterThan(0);
    expect(mgr.getLastListChange(userId, 'srv')).toBe(map.srv);
    expect(mgr.getLastListChangeForUser('other-user')).toEqual({});
  });

  it('isolates app-level (__app__) entries from user entries', async () => {
    const mgr = await MCPManager.createInstance({});

    mgr.markListChanged(MCPManager.APP_OWNER_KEY, 'srv');
    mgr.markListChanged('user-1', 'srv');

    expect(mgr.getLastListChange(MCPManager.APP_OWNER_KEY, 'srv')).toBeGreaterThan(0);
    expect(mgr.getLastListChange('user-1', 'srv')).toBeGreaterThan(0);
    expect(mgr.getLastListChangeForUser('user-1')).toEqual({
      srv: expect.any(Number),
    });
    expect(mgr.getLastListChangeForUser(MCPManager.APP_OWNER_KEY)).toEqual({
      srv: expect.any(Number),
    });
  });
});
