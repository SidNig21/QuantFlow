import { Mastra } from '@mastra/core';
import { qfConductorAgent } from './agents/conductor';

export const qfMastra = new Mastra({
  agents: { qfConductor: qfConductorAgent },
});

export { qfConductorAgent } from './agents/conductor';
export { delegateToTileTool } from './tools/delegate-to-tile';
