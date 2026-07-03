/**
 * E3/PF2 pty-flood — 5000 synthetic pty:data chunks must not drive canvas projection.
 */

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getHarnessStreamBytes,
  ingestPtyStreamBytes,
  readSpanLinesFromDir,
  resetTraceState,
} from "../../src/kernel/perf";
import { ingestPtyDataForTrace } from "../../quantflow-electron/src/main/pty.ts";
import {
  applyPtyCwdMilestone,
  createPtyCwdCoalescer,
  extractOsc7CwdPaths,
  processPtyDataForCanvas,
} from "../../quantflow-electron/src/windows/shell/src/pty-canvas-fence.js";

const FLOOD_N = 5000;
const SESSION_ID = "sess-pty-flood";
const TILE_ID = "tile-flood";

function osc7(path: string): string {
  return `\x1b]7;file://host${path}\x07`;
}

function makeChunk(index: number): Uint8Array {
  const base = `line-${index}-${"x".repeat(index % 128)}\n`;
  if (index % 17 === 0) {
    return new TextEncoder().encode(base + osc7(`/proj/path-${index % 5}`));
  }
  if (index % 23 === 0) {
    return new TextEncoder().encode(base + `\x1b]0;title-${index}\x07`);
  }
  return new TextEncoder().encode(base);
}

export function runPtyFloodCheck(): boolean {
  let updateCablesCount = 0;
  let syncTileListCount = 0;
  let titleUpdates = 0;
  let saveCanvasCount = 0;

  const tile = {
    id: TILE_ID,
    type: "term",
    ptySessionId: SESSION_ID,
    cwd: "/home",
    autoTitle: "/home",
  };

  const cwdCoalescer = createPtyCwdCoalescer({
    debounceMs: 0,
    onFlush: ({ cwd }) => {
      const result = applyPtyCwdMilestone(tile, cwd, {
        updateTileTitle: () => {
          titleUpdates += 1;
        },
        saveCanvasDebounced: () => {
          saveCanvasCount += 1;
        },
      });
      if (result.applied) {
        updateCablesCount += 0;
      }
    },
  });

  resetTraceState();
  process.env.QUANTFLOW_TRACE = "1";
  process.env.QF_PERF_DIR = mkdtempSync(join(tmpdir(), "qf-pty-flood-"));
  const spansBefore = readSpanLinesFromDir(process.env.QF_PERF_DIR).length;

  for (let i = 0; i < FLOOD_N; i += 1) {
    const data = makeChunk(i);
    processPtyDataForCanvas({ sessionId: SESSION_ID, data });

    ingestPtyStreamBytes(SESSION_ID, data);
    ingestPtyDataForTrace(SESSION_ID, Buffer.from(data));

    for (const cwd of extractOsc7CwdPaths(data)) {
      cwdCoalescer.schedule(TILE_ID, cwd);
    }
  }

  cwdCoalescer.flush();

  const spansAfter = readSpanLinesFromDir(process.env.QF_PERF_DIR).length;
  const bytes = getHarnessStreamBytes(SESSION_ID);

  delete process.env.QUANTFLOW_TRACE;
  delete process.env.QF_PERF_DIR;

  const okProjection =
    updateCablesCount === 0
    && syncTileListCount === 0;
  const okMilestones = titleUpdates <= 5 && saveCanvasCount <= 5;
  const okBytes = bytes.stdout > 0;
  const okSpans = spansAfter === spansBefore;

  console.log(
    `B7 pty flood: chunks=${FLOOD_N} syncTileList=${syncTileListCount} `
      + `updateCables=${updateCablesCount} saveCanvas=${saveCanvasCount} `
      + `titleUpdates=${titleUpdates} stdoutBytes=${bytes.stdout} spans=${spansAfter - spansBefore}`,
  );

  if (!okProjection) {
    console.error(
      "Expected 0 projection/canvas side effects from raw stream flood",
    );
    return false;
  }
  if (!okMilestones) {
    console.error(
      `Expected O(1) cwd title updates (<=5 unique paths); got ${titleUpdates}`,
    );
    return false;
  }
  if (!okBytes) {
    console.error("Expected PF0 byte counter to accumulate stdout bytes");
    return false;
  }
  if (!okSpans) {
    console.error("Expected no new perf spans per stdout chunk");
    return false;
  }

  return true;
}
