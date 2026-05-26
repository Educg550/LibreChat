import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';

export function useMCPConnectionStatus({ enabled }: { enabled?: boolean } = {}) {
  const { data } = useMCPConnectionStatusQuery({
    enabled,
  });

  const queryClient = useQueryClient();
  const previousListChangeRef = useRef<Record<string, number>>({});

  useEffect(() => {
    /**
     * The connection-status response now exposes `lastListChange` per server.
     * Compare against the previous poll's timestamps; if any server's timestamp
     * increased, the server emitted `notifications/resources/list_changed` and
     * we invalidate the cached resource list for that server.
     * Spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
     */
    const latest = data?.lastListChange ?? {};
    const previous = previousListChangeRef.current;
    for (const [serverName, ts] of Object.entries(latest)) {
      if ((previous[serverName] ?? 0) < ts) {
        queryClient.invalidateQueries([QueryKeys.mcpResources, serverName]);
      }
    }
    previousListChangeRef.current = latest;
  }, [data, queryClient]);

  return {
    connectionStatus: data?.connectionStatus,
  };
}
