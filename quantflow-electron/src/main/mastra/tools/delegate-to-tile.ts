import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sendTileDelegate } from '../../tile-relay-dispatcher';
import { getConnectionById } from '../../tile-session-registry';

export const delegateToTileTool = createTool({
  id: 'delegate-to-tile',
  description:
    'Delegate a message to a peer tile over a Kernel cable connection. Requires a valid connectionId linking fromTileId and toTileId.',
  inputSchema: z.object({
    fromTileId: z.string().min(1),
    toTileId: z.string().min(1),
    connectionId: z.string().min(1),
    message: z.string().min(1),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    message: z.string().optional(),
    reply: z.string().optional(),
  }),
  execute: async (inputData) => {
    const connectionId = inputData.connectionId.trim();
    const fromTileId = inputData.fromTileId.trim();
    const toTileId = inputData.toTileId.trim();
    const message = inputData.message.trim();

    const conn = getConnectionById(connectionId);
    if (!conn) {
      return { ok: false, message: `connection not found: ${connectionId}` };
    }

    return sendTileDelegate({
      fromTileId,
      toTileId,
      cableId: connectionId,
      text: message,
    });
  },
});
