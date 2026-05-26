import { memo } from 'react';
import { FileIcon } from 'lucide-react';
import type { MCPResourceListItem as MCPResource } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { pickBestIcon } from './pickBestIcon';

type Props = {
  resource: MCPResource;
  checked: boolean;
  onToggle: (uri: string, next: boolean) => void;
  attached: boolean;
};

const ICON_PX = 20;

function MCPResourceListItemImpl({ resource, checked, onToggle, attached }: Props) {
  const localize = useLocalize();
  const iconSrc = pickBestIcon(resource.icons, ICON_PX);
  return (
    <li
      role="option"
      aria-selected={checked}
      className="flex items-start gap-3 rounded-md p-2 hover:bg-surface-hover"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(resource.uri, e.target.checked)}
        aria-label={localize('com_ui_mcp_resource_select_aria', { name: resource.name })}
      />
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          width={ICON_PX}
          height={ICON_PX}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <FileIcon size={ICON_PX} aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">
          {resource.title || resource.name}
          {attached && (
            <span className="ml-2 text-xs text-text-secondary">
              {localize('com_ui_mcp_resource_attached_tag')}
            </span>
          )}
        </div>
        {resource.description && (
          <div className="truncate text-sm text-text-secondary">{resource.description}</div>
        )}
        <div className="text-xs text-text-tertiary">
          {resource.mimeType} {resource.size ? `· ${formatBytes(resource.size)}` : ''}
        </div>
      </div>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

export const MCPResourceListItem = memo(MCPResourceListItemImpl);
