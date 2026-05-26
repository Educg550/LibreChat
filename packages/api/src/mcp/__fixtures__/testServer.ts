import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  InMemoryTransport,
  type InMemoryTransport as InMemoryTransportType,
} from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

export type FixtureResource = {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  content: { kind: 'text'; text: string } | { kind: 'blob'; base64: string };
};

export type FixtureHandle = {
  serverTransport: InMemoryTransportType;
  clientTransport: InMemoryTransportType;
  emitListChanged: () => Promise<void>;
  setMissing: (uri: string, missing: boolean) => void;
  setResources: (next: FixtureResource[]) => void;
  close: () => Promise<void>;
};

export async function startFixtureServer(initial: FixtureResource[]): Promise<FixtureHandle> {
  let resources = [...initial];
  const missing = new Set<string>();

  const server = new Server(
    { name: 'librechat-fixture-server', version: '0.0.0' },
    { capabilities: { resources: { listChanged: true } } },
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resources.map(({ content: _omit, ...r }) => r),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    if (missing.has(uri)) {
      throw new McpError(ErrorCode.InvalidParams, 'Resource not found', { uri });
    }
    const r = resources.find((x) => x.uri === uri);
    if (!r) {
      throw new McpError(ErrorCode.InvalidParams, 'Resource not found', { uri });
    }
    const base = { uri: r.uri, mimeType: r.mimeType };
    return {
      contents: [
        r.content.kind === 'text'
          ? { ...base, text: r.content.text }
          : { ...base, blob: r.content.base64 },
      ],
    };
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  return {
    serverTransport,
    clientTransport,
    emitListChanged: async () => {
      await server.notification({ method: 'notifications/resources/list_changed' });
    },
    setMissing: (uri, m) => {
      if (m) missing.add(uri);
      else missing.delete(uri);
    },
    setResources: (next) => {
      resources = [...next];
    },
    close: async () => {
      await server.close();
    },
  };
}
