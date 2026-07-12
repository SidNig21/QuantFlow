/**
 * One-shot probe: does RivetKit native agentOS() accept toolKits on 0.2.7?
 */
import { agentOS } from "@rivet-dev/agentos";
import { toolKit, hostTool } from "@rivet-dev/agentos-core";
import { z } from "zod";

const kit = toolKit({
  name: "probe",
  description: "probe",
  tools: {
    ping: hostTool({
      description: "p",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    }),
  },
});

let rejected = false;
let message = "";
try {
  agentOS({ software: [], toolKits: [kit] });
  console.log("ACCEPTED: agentOS({ toolKits }) did not throw");
} catch (err) {
  rejected = true;
  message = err instanceof Error ? err.message : String(err);
  console.log("REJECTED:", message.slice(0, 600));
}

process.exit(rejected ? 0 : 1);
