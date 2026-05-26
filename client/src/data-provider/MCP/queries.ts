import { useInfiniteQuery, useQuery, useMutation, useQueryClient, UseInfiniteQueryOptions, UseQueryOptions, UseMutationOptions, QueryObserverResult } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

/**
 * Hook for fetching all accessible MCP servers with permission metadata
 */
export const useMCPServersQuery = <TData = t.MCPServersListResponse>(
  config?: UseQueryOptions<t.MCPServersListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.MCPServersListResponse, unknown, TData>(
    [QueryKeys.mcpServers],
    () => dataService.getMCPServers(),
    {
      staleTime: 30 * 1000, // 30 seconds — short enough to pick up servers that finish initializing after first load
      refetchOnWindowFocus: true,
      refetchOnReconnect: false,
      refetchOnMount: true,
      retry: false,
      ...config,
    },
  );
};

/**
 * Hook for fetching MCP-specific tools
 * @param config - React Query configuration
 * @returns MCP servers with their tools
 */
export const useMCPToolsQuery = <TData = t.MCPServersResponse>(
  config?: UseQueryOptions<t.MCPServersResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.MCPServersResponse, unknown, TData>(
    [QueryKeys.mcpTools],
    () => dataService.getMCPTools(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      ...config,
    },
  );
};

/**
 * Lists MCP resources for a server with opaque cursor pagination.
 *
 * Spec:
 *  - https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 *  - https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination
 */
export const useMCPResourcesQuery = (
  serverName: string,
  config?: UseInfiniteQueryOptions<t.MCPResourcesListResponse>,
) =>
  useInfiniteQuery<t.MCPResourcesListResponse>(
    [QueryKeys.mcpResources, serverName],
    ({ pageParam }) => dataService.listMCPResources(serverName, pageParam as string | undefined),
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      enabled: !!serverName,
      ...config,
    },
  );

/**
 * Attaches an MCP resource to an agent's file_search corpus.
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 */
export const useAttachMCPResourceMutation = (
  serverName: string,
  options?: UseMutationOptions<t.MCPResourceAttachResponse, unknown, t.MCPResourceAttachPayload>,
) => {
  const queryClient = useQueryClient();
  return useMutation<t.MCPResourceAttachResponse, unknown, t.MCPResourceAttachPayload>(
    [MutationKeys.attachMCPResource, serverName],
    (payload) => dataService.attachMCPResource(serverName, payload),
    {
      ...options,
      onSuccess: (data, vars, ctx) => {
        queryClient.invalidateQueries([QueryKeys.agent, vars.agentId]);
        options?.onSuccess?.(data, vars, ctx);
      },
    },
  );
};

/**
 * Re-fetches and re-indexes a previously-attached MCP resource.
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 */
export const useRefreshMCPResourceMutation = (
  serverName: string,
  options?: UseMutationOptions<t.MCPResourceRefreshResponse, unknown, t.MCPResourceRefreshPayload>,
) =>
  useMutation<t.MCPResourceRefreshResponse, unknown, t.MCPResourceRefreshPayload>(
    [MutationKeys.refreshMCPResource, serverName],
    (payload) => dataService.refreshMCPResource(serverName, payload),
    options,
  );

/**
 * Unlinks an MCP-sourced file_id from an agent (orphan-on-detach).
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 */
export const useDetachMCPResourceMutation = (
  serverName: string,
  options?: UseMutationOptions<{ ok: true }, unknown, t.MCPResourceDetachPayload>,
) => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, unknown, t.MCPResourceDetachPayload>(
    [MutationKeys.detachMCPResource, serverName],
    (payload) => dataService.detachMCPResource(serverName, payload),
    {
      ...options,
      onSuccess: (data, vars, ctx) => {
        queryClient.invalidateQueries([QueryKeys.agent, vars.agentId]);
        options?.onSuccess?.(data, vars, ctx);
      },
    },
  );
};
