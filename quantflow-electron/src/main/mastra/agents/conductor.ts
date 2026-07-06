import { Agent } from '@mastra/core/agent';
import { delegateToTileTool } from '../tools/delegate-to-tile';

const DEFAULT_MASTRA_MODEL =
  process.env.QF_MASTRA_MODEL?.trim() || 'openai/gpt-4o-mini';

export const qfConductorAgent = new Agent({
  id: 'qf-conductor',
  name: 'QuantFlow Conductor',
  instructions: `
You are the QuantFlow meta-harness supervisor embedded in the operator console.
When work should run on a peer tile, use delegateToTile with the Kernel cable id
that connects the orchestrator tile to the worker tile.
Never delegate without a valid cable connection.`,
  model: DEFAULT_MASTRA_MODEL,
  tools: { delegateToTile: delegateToTileTool },
});
