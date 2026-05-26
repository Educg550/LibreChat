import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { MCPResourceList } from './MCPResourceList';
import { useLocalize } from '~/hooks';

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
    () =>
      Object.fromEntries(
        mcpServerNames.map((s) => [s, new Set(attachedByServer[s] ?? new Set<string>())]),
      ),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    if (mcpServerNames.length && !mcpServerNames.includes(activeServer)) {
      setActiveServer(mcpServerNames[0]);
    }
  }, [mcpServerNames, activeServer]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSelectionByServer(
        Object.fromEntries(
          mcpServerNames.map((s) => [s, new Set(attachedByServer[s] ?? new Set<string>())]),
        ),
      );
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, mcpServerNames, attachedByServer]);

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
    const touchedServers: string[] = [];
    for (const serverName of mcpServerNames) {
      const selection = selectionByServer[serverName] ?? new Set<string>();
      const attached = attachedByServer[serverName] ?? new Set<string>();
      const toAttach = [...selection].filter((u) => !attached.has(u));
      const toDetach = [...attached].filter((u) => !selection.has(u));

      if (toAttach.length || toDetach.length) {
        touchedServers.push(serverName);
      }

      for (const uri of toAttach) {
        try {
          await dataService.attachMCPResource(serverName, { uri, agentId });
        } catch {
          localFailures.push(`attach:${serverName}:${uri}`);
        }
      }
      for (const uri of toDetach) {
        try {
          await dataService.detachMCPResource(serverName, { uri, agentId });
        } catch {
          localFailures.push(`detach:${serverName}:${uri}`);
        }
      }
    }
    queryClient.invalidateQueries([QueryKeys.agent, agentId]);
    for (const serverName of touchedServers) {
      queryClient.invalidateQueries([QueryKeys.mcpResources, serverName]);
    }
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
          <div
            role="tablist"
            aria-label={localize('com_ui_mcp_resource_servers_aria')}
            className="mt-4 flex gap-2 border-b"
          >
            {mcpServerNames.map((name) => (
              <button
                key={name}
                id={`mcp-tab-${name}`}
                role="tab"
                aria-selected={activeServer === name}
                aria-controls={`mcp-panel-${name}`}
                tabIndex={activeServer === name ? 0 : -1}
                onClick={() => setActiveServer(name)}
                className={`px-3 py-2 ${activeServer === name ? 'border-b-2 border-brand-primary' : ''}`}
              >
                {name}
              </button>
            ))}
          </div>
          {activeServer && (
            <div
              role="tabpanel"
              id={`mcp-panel-${activeServer}`}
              aria-labelledby={`mcp-tab-${activeServer}`}
              className="mt-2 max-h-96 overflow-y-auto"
            >
              <MCPResourceList
                serverName={activeServer}
                selectedUris={selectionByServer[activeServer] ?? new Set<string>()}
                attachedUris={attachedByServer[activeServer] ?? new Set<string>()}
                onToggle={handleToggle}
              />
            </div>
          )}
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
