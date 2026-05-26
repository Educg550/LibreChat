const fs = require('fs');
const os = require('os');
const path = require('path');
const { getStrategyFunctions } = require('./strategies');

/**
 * Builds an upload adapter that funnels MCP-sourced buffers through the same
 * `handleFileUpload` strategy used by user uploads. MCP resources arrive as
 * decoded text/blob payloads (not multipart streams), so we materialize them
 * into a tempfile to satisfy the multer-style `{ path, originalname, mimetype, size }`
 * contract that existing strategies (local, vectordb, s3, etc.) consume.
 *
 * @param {import('librechat-data-provider').AppConfig} appConfig
 * @returns {(args: { buffer: Buffer, filename: string, mimeType: string, userId: string })
 *   => Promise<{ file_id: string, bytes: number, filepath: string, embedded: boolean,
 *     storageKey?: string, storageRegion?: string, width?: number, height?: number }>}
 */
const createMCPUploadAdapter =
  (appConfig) =>
  async ({ buffer, filename, mimeType, userId }) => {
    const strategy = appConfig.fileStrategy;
    const { handleFileUpload } = getStrategyFunctions(strategy);

    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tmpPath = path.join(os.tmpdir(), `mcp-${userId}-${Date.now()}-${safeName}`);
    await fs.promises.writeFile(tmpPath, buffer);

    const file_id = require('crypto').randomUUID();

    try {
      const file = {
        buffer,
        path: tmpPath,
        originalname: filename,
        mimetype: mimeType,
        size: buffer.length,
      };

      const result = await handleFileUpload({
        req: { user: { id: userId }, config: appConfig },
        file,
        file_id,
      });

      return {
        file_id: result.id ?? result.file_id ?? file_id,
        bytes: result.bytes ?? buffer.length,
        filepath: result.filepath,
        embedded: result.embedded ?? false,
        storageKey: result.storageKey,
        storageRegion: result.storageRegion,
        width: result.width,
        height: result.height,
      };
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  };

module.exports = { createMCPUploadAdapter };
