import { RefreshCw } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import type { TFile } from 'librechat-data-provider';
import { useRefreshMCPResourceMutation } from '~/data-provider/MCP/queries';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

type Props = { file: TFile };

export function MCPAttachedFileBadge({ file }: Props) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const serverName = file.metadata?.mcpServerName ?? '';
  const uri = file.metadata?.mcpResource?.uri ?? '';
  const refresh = useRefreshMCPResourceMutation(serverName, {
    onSuccess: () => showToast({ message: localize('com_ui_mcp_resource_refreshed') }),
    onError: () =>
      showToast({
        message: localize('com_ui_mcp_resource_refresh_failed'),
        severity: NotificationSeverity.ERROR,
      }),
  });

  if (!serverName || !uri) return null;

  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="rounded bg-surface-secondary px-1 py-0.5" title={uri}>
        MCP · {serverName}
      </span>
      <button
        type="button"
        className="text-text-secondary hover:text-text-primary"
        aria-label={localize('com_ui_mcp_resource_refresh_aria', { name: file.filename })}
        onClick={() => refresh.mutate({ uri })}
        disabled={refresh.isLoading}
      >
        <RefreshCw size={14} className={refresh.isLoading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
