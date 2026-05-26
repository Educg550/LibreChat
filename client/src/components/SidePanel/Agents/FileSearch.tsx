import { memo, useMemo, useRef, useState } from 'react';
import { Folder } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import { useFormContext } from 'react-hook-form';
import { SharePointIcon, AttachmentIcon, DropdownPopup } from '@librechat/client';
import {
  FileSources,
  EModelEndpoint,
  EToolResources,
  AgentCapabilities,
} from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile, AgentForm } from '~/common';
import { useSharePointFileHandlingNoChatContext } from '~/hooks/Files/useSharePointFileHandling';
import { MCPResourcePickerDialog, MCPAttachedFileBadge } from './MCPResources';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useMCPConnectionStatus } from '~/hooks/MCP/useMCPConnectionStatus';
import { useAgentFileConfig, useLocalize, useLazyEffect } from '~/hooks';
import { SharePointPickerDialog } from '~/components/SharePoint';
import FileRow from '~/components/Chat/Input/Files/FileRow';
import { useGetStartupConfig } from '~/data-provider';
import FileSearchCheckbox from './FileSearchCheckbox';
import { isEphemeralAgent } from '~/common';

function FileSearch({
  agent_id,
  files: _files,
  mcpServerNames,
}: {
  agent_id: string;
  files?: [string, ExtendedFile][];
  mcpServerNames?: string[];
}) {
  const localize = useLocalize();
  const { watch } = useFormContext<AgentForm>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Map<string, ExtendedFile>>(new Map());
  const fileHandlingState = useMemo(() => ({ files, setFiles, conversation: null }), [files]);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);
  const [showMCPDialog, setShowMCPDialog] = useState(false);
  const { capabilities } = useMCPConnectionStatus();

  const eligibleMcpServerNames = useMemo(
    () => (mcpServerNames ?? []).filter((name) => capabilities?.[name]?.resources != null),
    [mcpServerNames, capabilities],
  );

  const mcpFiles = useMemo(
    () => (_files ?? []).filter(([, file]) => file.source === FileSources.mcp),
    [_files],
  );

  const attachedByServer = useMemo(() => {
    const grouped: Record<string, Set<string>> = {};
    for (const [, file] of mcpFiles) {
      const serverName = file.metadata?.mcpServerName;
      const uri = file.metadata?.mcpResource?.uri;
      if (!serverName || !uri) continue;
      if (!grouped[serverName]) grouped[serverName] = new Set<string>();
      grouped[serverName].add(uri);
    }
    return grouped;
  }, [mcpFiles]);

  // Get startup configuration for SharePoint feature flag
  const { data: startupConfig } = useGetStartupConfig();
  const { endpointFileConfig, providerValue, endpointType } = useAgentFileConfig();
  const endpointOverride = providerValue || EModelEndpoint.agents;

  const { handleFileChange } = useFileHandlingNoChatContext(
    {
      additionalMetadata: { agent_id, tool_resource: EToolResources.file_search },
      endpointOverride,
      endpointTypeOverride: endpointType,
      fileSetter: setFiles,
    },
    fileHandlingState,
  );

  const { handleSharePointFiles, isProcessing, downloadProgress } =
    useSharePointFileHandlingNoChatContext(
      {
        additionalMetadata: { agent_id, tool_resource: EToolResources.file_search },
        endpointOverride,
        endpointTypeOverride: endpointType,
        fileSetter: setFiles,
      },
      fileHandlingState,
    );

  useLazyEffect(
    () => {
      if (_files) {
        setFiles(new Map(_files));
      }
    },
    [_files],
    750,
  );

  const fileSearchChecked = watch(AgentCapabilities.file_search);
  const isUploadDisabled = endpointFileConfig?.disabled ?? false;

  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;
  const disabledUploadButton = isEphemeralAgent(agent_id) || fileSearchChecked === false;

  const handleSharePointFilesSelected = async (sharePointFiles: any[]) => {
    try {
      await handleSharePointFiles(sharePointFiles);
      setIsSharePointDialogOpen(false);
    } catch (error) {
      console.error('SharePoint file processing error:', error);
    }
  };
  if (isUploadDisabled) {
    return null;
  }

  const handleButtonClick = () => {
    // necessary to reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const handleLocalFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const dropdownItems = [
    {
      label: localize('com_files_upload_local_machine'),
      onClick: handleLocalFileClick,
      icon: <Folder className="icon-md" />,
    },
    {
      label: localize('com_files_upload_sharepoint'),
      onClick: () => setIsSharePointDialogOpen(true),
      icon: <SharePointIcon className="icon-md" />,
    },
  ];

  const menuTrigger = (
    <Ariakit.MenuButton
      disabled={disabledUploadButton}
      className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg text-sm font-medium"
    >
      <div className="flex w-full items-center justify-center gap-1">
        <AttachmentIcon className="text-token-text-primary h-4 w-4" />
        {localize('com_ui_upload_file_search')}
      </div>
    </Ariakit.MenuButton>
  );

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <span>
          <label className="text-token-text-primary block text-sm font-medium">
            {localize('com_assistants_file_search')}
          </label>
        </span>
      </div>
      <FileSearchCheckbox />
      <div className="flex flex-col gap-3">
        {mcpFiles.length > 0 && (
          <div className="flex flex-col gap-1">
            {mcpFiles.map(([id, file]) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-md border border-border-light px-2 py-1 text-sm"
              >
                <span className="truncate">{file.filename}</span>
                <MCPAttachedFileBadge file={file as unknown as TFile} />
              </div>
            ))}
          </div>
        )}
        {/* File Search (RAG API) Files */}
        <FileRow
          files={files}
          setFiles={setFiles}
          agent_id={agent_id}
          tool_resource={EToolResources.file_search}
          fileFilter={(file) => file.source !== FileSources.mcp}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2">{children}</div>}
        />
        <div>
          {sharePointEnabled ? (
            <DropdownPopup
              gutter={2}
              menuId="file-search-upload-menu"
              isOpen={isPopoverActive}
              setIsOpen={setIsPopoverActive}
              trigger={menuTrigger}
              items={dropdownItems}
              modal={true}
              unmountOnHide={true}
            />
          ) : (
            <button
              type="button"
              disabled={disabledUploadButton}
              className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg text-sm font-medium"
              onClick={handleButtonClick}
            >
              <div className="flex w-full items-center justify-center gap-1">
                <AttachmentIcon className="text-token-text-primary h-4 w-4" />
                {localize('com_ui_upload_file_search')}
              </div>
            </button>
          )}
          {eligibleMcpServerNames.length > 0 && (
            <button
              type="button"
              disabled={disabledUploadButton}
              className="btn btn-neutral border-token-border-light relative mt-2 h-9 w-full rounded-lg text-sm font-medium"
              onClick={() => setShowMCPDialog(true)}
            >
              <div className="flex w-full items-center justify-center gap-1">
                {localize('com_ui_mcp_resource_add_button')}
              </div>
            </button>
          )}
          <input
            multiple={true}
            type="file"
            style={{ display: 'none' }}
            tabIndex={-1}
            ref={fileInputRef}
            disabled={disabledUploadButton}
            onChange={handleFileChange}
          />
        </div>
        {/* Disabled Message */}
        {agent_id ? null : (
          <div className="text-xs text-text-secondary">
            {localize('com_agents_file_search_disabled')}
          </div>
        )}
      </div>

      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        disabled={disabledUploadButton}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
        maxSelectionCount={endpointFileConfig?.fileLimit}
      />
      <MCPResourcePickerDialog
        isOpen={showMCPDialog}
        setIsOpen={setShowMCPDialog}
        agentId={agent_id}
        mcpServerNames={eligibleMcpServerNames}
        attachedByServer={attachedByServer}
      />
    </div>
  );
}

const MemoizedFileSearch = memo(FileSearch);
MemoizedFileSearch.displayName = 'FileSearch';

export default MemoizedFileSearch;
