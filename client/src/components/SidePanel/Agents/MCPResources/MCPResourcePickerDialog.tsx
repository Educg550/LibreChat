import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import {
  useAttachMCPResourceMutation,
  useDetachMCPResourceMutation,
} from '~/data-provider/MCP/queries';
import { useLocalize } from '~/hooks';
import { MCPResourceList } from './MCPResourceList';

type Props = {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  agentId: string;
  mcpServerNames: string[];
  attachedByServer: Record<string, Set<string>>;
};

export function MCPResourcePickerDialog({
  isOpen,
  setIsOpen,
  agentId,
  mcpServerNames,
  attachedByServer,
}: Props) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [activeServer, setActiveServer] = useState<string>(mcpServerNames[0] ?? '');
  const [selectionByServer, setSelectionByServer] = useState<Record<string, Set<string>>>(
    () => Object.fromEntries(mcpServerNames.map((s) => [s, new Set<string>()])),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    if (mcpServerNames.length && !mcpServerNames.includes(activeServer)) {
      setActiveServer(mcpServerNames[0]);
    }
  }, [mcpServerNames, activeServer]);

  const attach = useAttachMCPResourceMutation(activeServer);
  const detach = useDetachMCPResourceMutation(activeServer);

  const handleToggle = (uri: string, next: boolean) => {
    setSelectionByServer((prev) => {
      const cur = new Set(prev[activeServer] ?? []);
      if (next) cur.add(uri);
      else cur.delete(uri);
      return { ...prev, [activeServer]: cur };
    });
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    setFailures([]);
    const localFailures: string[] = [];
    for (const serverName of mcpServerNames) {
      const selection = selectionByServer[serverName] ?? new Set<string>();
      const attached = attachedByServer[serverName] ?? new Set<string>();
      const toAttach = [...selection].filter((u) => !attached.has(u));
      const toDetach = [...attached].filter((u) => !selection.has(u));

      for (const uri of toAttach) {
        try {
          await attach.mutateAsync({ uri, agentId });
        } catch {
          localFailures.push(`attach:${serverName}:${uri}`);
        }
      }
      for (const uri of toDetach) {
        try {
          await detach.mutateAsync({ uri, agentId });
        } catch {
          localFailures.push(`detach:${serverName}:${uri}`);
        }
      }
    }
    queryClient.invalidateQueries([QueryKeys.agent, agentId]);
    setIsSaving(false);
    setFailures(localFailures);
    if (!localFailures.length) setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="max-w-2xl w-full rounded-lg bg-surface-primary p-6">
          <DialogTitle className="text-lg font-semibold">
            {localize('com_ui_mcp_resource_picker_title')}
          </DialogTitle>
          <div className="mt-2 text-xs text-text-secondary">
            {localize('com_ui_mcp_resource_templates_unsupported')}
          </div>
          <div role="tablist" className="mt-4 flex gap-2 border-b">
            {mcpServerNames.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={activeServer === name}
                onClick={() => setActiveServer(name)}
                className={`px-3 py-2 ${activeServer === name ? 'border-b-2 border-brand-primary' : ''}`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="mt-2 max-h-96 overflow-y-auto">
            {activeServer && (
              <MCPResourceList
                serverName={activeServer}
                selectedUris={selectionByServer[activeServer] ?? new Set<string>()}
                attachedUris={attachedByServer[activeServer] ?? new Set<string>()}
                onToggle={handleToggle}
              />
            )}
          </div>
          {failures.length > 0 && (
            <div className="mt-3 text-sm text-text-error">
              {localize('com_ui_mcp_resource_partial_failure', { count: failures.length })}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-neutral"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              {localize('com_ui_cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={isSaving}
            >
              {isSaving ? localize('com_ui_saving') : localize('com_ui_save')}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
