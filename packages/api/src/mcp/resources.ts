/**
 * MCP Resources read-path implementation.
 *
 * Spec references:
 * - https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 * - https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
