import { useEffect, useMemo, useRef } from 'react';
import { useMCPResourcesQuery } from '~/data-provider/MCP/queries';
import { useLocalize } from '~/hooks';
import { MCPResourceListItem } from './MCPResourceListItem';

type Props = {
  serverName: string;
  selectedUris: Set<string>;
  attachedUris: Set<string>;
  onToggle: (uri: string, next: boolean) => void;
};

export function MCPResourceList({ serverName, selectedUris, attachedUris, onToggle }: Props) {
  const localize = useLocalize();
  const query = useMCPResourcesQuery(serverName);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const allResources = useMemo(
    () => (query.data?.pages.flatMap((p) => p.resources) ?? []),
    [query.data],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      },
      { rootMargin: '100px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query]);

  if (query.isError) {
    const status = (query.error as { response?: { status?: number } } | undefined)?.response?.status;
    if (status === 404) {
      return (
        <div className="p-4 text-sm text-text-secondary">
          {localize('com_ui_mcp_resource_unsupported')}
        </div>
      );
    }
    return (
      <div className="p-4 text-sm text-text-error">
        {localize('com_ui_mcp_resource_list_error')}
      </div>
    );
  }

  if (query.isLoading) {
    return <div className="p-4 text-sm">{localize('com_ui_loading')}</div>;
  }

  if (!allResources.length) {
    return (
      <div className="p-4 text-sm text-text-secondary">
        {localize('com_ui_mcp_resource_empty')}
      </div>
    );
  }

  return (
    <div>
      <ul role="listbox" aria-label={localize('com_ui_mcp_resource_list_aria')}>
        {allResources.map((r) => (
          <MCPResourceListItem
            key={r.uri}
            resource={r}
            checked={selectedUris.has(r.uri)}
            attached={attachedUris.has(r.uri)}
            onToggle={onToggle}
          />
        ))}
      </ul>
      <div ref={sentinelRef} aria-hidden="true" />
      {query.isFetchingNextPage && (
        <div className="p-2 text-center text-xs text-text-secondary">
          {localize('com_ui_loading_more')}
        </div>
      )}
    </div>
  );
}
