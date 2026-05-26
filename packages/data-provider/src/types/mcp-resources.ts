import type { MCPResourceMetadata } from './files';

export type MCPResourceListItem = MCPResourceMetadata;

export type MCPResourcesListResponse = {
  resources: MCPResourceListItem[];
  nextCursor?: string;
};

export type MCPResourceAttachPayload = {
  uri: string;
  agentId: string;
};

export type MCPResourceAttachResponse = {
  file_id: string;
  created: boolean;
};

export type MCPResourceRefreshPayload = {
  uri: string;
};

export type MCPResourceRefreshResponse = {
  file_id: string;
  lastIndexedAt: string | Date;
  status: 'refreshed';
};

export type MCPResourceDetachPayload = {
  uri: string;
  agentId: string;
};
