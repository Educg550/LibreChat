/**
 * MCP Resources read-path implementation.
 *
 * Spec references:
 * - https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 * - https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination
 */
import { FileSources } from 'librechat-data-provider';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Model as MongooseModel } from 'mongoose';
import type { IMongoFile } from '@librechat/data-schemas';
import type { MCPResourceMetadata } from 'librechat-data-provider';

export type MCPResourceListItem = {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  icons?: Array<{ src: string; mimeType?: string; sizes?: string[] }>;
};

export type ListServerResourcesArgs = {
  client: Client;
  cursor?: string;
};

export type ListServerResourcesResult = {
  resources: MCPResourceListItem[];
  nextCursor?: string;
};

/**
 * Calls MCP `resources/list` with opaque cursor passthrough per
 * https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination
 * Cursor is treated as an opaque token — never inspected, parsed, or persisted across sessions.
 */
export async function listServerResources(
  args: ListServerResourcesArgs,
): Promise<ListServerResourcesResult> {
  const { resources, nextCursor } = await args.client.listResources(
    args.cursor ? { cursor: args.cursor } : undefined,
  );
  return {
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      title: r.title,
      description: r.description,
      mimeType: r.mimeType,
      size: r.size,
      icons: r.icons,
    })),
    nextCursor,
  };
}

export type ReadResourceArgs = { client: Client; uri: string };

export type ResourceContent =
  | { uri: string; mimeType?: string; text: string }
  | { uri: string; mimeType?: string; blob: string };

export type ReadResourceResult = { contents: ResourceContent[] };

/**
 * Calls MCP `resources/read` per
 * https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 * Returns the resource contents as a discriminated union of text or blob.
 */
export async function readResource(args: ReadResourceArgs): Promise<ReadResourceResult> {
  const { contents } = await args.client.readResource({ uri: args.uri });
  return {
    contents: contents.map((c) => {
      if ('text' in c && typeof c.text === 'string') {
        return { uri: c.uri, mimeType: c.mimeType, text: c.text };
      }
      if ('blob' in c && typeof c.blob === 'string') {
        return { uri: c.uri, mimeType: c.mimeType, blob: c.blob };
      }
      throw new Error(`Unsupported resource content shape for ${c.uri}`);
    }),
  };
}

export type UploadAdapterArgs = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  userId: string;
};

export type UploadAdapterResult = {
  file_id: string;
  bytes: number;
  filepath: string;
  embedded: boolean;
  storageKey?: string;
  storageRegion?: string;
  width?: number;
  height?: number;
};

export type UploadAdapter = (args: UploadAdapterArgs) => Promise<UploadAdapterResult>;

export type IngestResourceArgs = {
  userId: string;
  serverName: string;
  uri: string;
  client: Client;
  uploadAdapter: UploadAdapter;
  fileModel: MongooseModel<IMongoFile>;
};

export type IngestResourceResult = {
  userId: string;
  file_id: string;
  created: boolean;
};

/**
 * Orchestrates fetching, dedupe lookup, and File creation for an MCP resource.
 * Spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 *
 * Dedupe key: (user, source='mcp', metadata.mcpServerName, metadata.mcpResource.uri).
 * If a matching File exists, returns its file_id without re-fetching or re-uploading.
 * Otherwise reads the resource, decodes text/blob, hands the buffer to the upload adapter,
 * and persists a new File row mirroring the MCP resource definition in metadata.
 */
export async function ingestResource(args: IngestResourceArgs): Promise<IngestResourceResult> {
  const existing = await args.fileModel
    .findOne({
      user: args.userId,
      source: FileSources.mcp,
      'metadata.mcpServerName': args.serverName,
      'metadata.mcpResource.uri': args.uri,
    })
    .lean<{ file_id: string } | null>();
  if (existing) {
    return {
      userId: args.userId,
      file_id: existing.file_id,
      created: false,
    };
  }

  const [meta, body] = await Promise.all([
    fetchListItemMetadata(args.client, args.uri),
    readResource({ client: args.client, uri: args.uri }),
  ]);
  const first = body.contents[0];
  if (!first) throw new Error(`Empty contents from ${args.uri}`);

  const buffer =
    'text' in first ? Buffer.from(first.text, 'utf8') : Buffer.from(first.blob, 'base64');

  const mimeType = first.mimeType ?? meta.mimeType ?? 'application/octet-stream';
  const filename = sanitizeFilename(meta.name ?? meta.title ?? args.uri);

  const uploaded = await args.uploadAdapter({
    buffer,
    filename,
    mimeType,
    userId: args.userId,
  });

  const resourceMetadata: MCPResourceMetadata = {
    uri: args.uri,
    name: meta.name ?? filename,
    title: meta.title,
    description: meta.description,
    icons: meta.icons,
    mimeType,
    size: meta.size ?? buffer.length,
  };

  await args.fileModel.create({
    user: args.userId,
    file_id: uploaded.file_id,
    bytes: uploaded.bytes,
    filename,
    filepath: uploaded.filepath,
    storageKey: uploaded.storageKey,
    storageRegion: uploaded.storageRegion,
    object: 'file',
    type: mimeType,
    source: FileSources.mcp,
    embedded: uploaded.embedded,
    width: uploaded.width,
    height: uploaded.height,
    status: 'ready',
    usage: 0,
    metadata: {
      mcpServerName: args.serverName,
      mcpResource: resourceMetadata,
      mcpLastIndexedAt: new Date(),
    },
  });

  return { userId: args.userId, file_id: uploaded.file_id, created: true };
}

async function fetchListItemMetadata(client: Client, uri: string): Promise<MCPResourceListItem> {
  const { resources } = await client.listResources();
  const found = resources.find((r) => r.uri === uri);
  if (!found) return { uri, name: uri.split('/').pop() ?? uri };
  return {
    uri: found.uri,
    name: found.name,
    title: found.title,
    description: found.description,
    mimeType: found.mimeType,
    size: found.size,
    icons: found.icons,
  };
}

function sanitizeFilename(input: string): string {
  return input.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200);
}
