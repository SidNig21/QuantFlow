import { setTimeout as delay } from "node:timers/promises";
import { callHerdrSocket } from "../src/main/herdr-socket-bridge";
import { spawnHerdrRoleSession } from "../src/main/herdr-session-spawn";

const token = `qf_2b_smoke_${Date.now()}`;

async function readPane(paneId: string): Promise<Record<string, unknown>> {
  return callHerdrSocket("pane.read", {
    pane_id: paneId,
    source: "visible",
    lines: 80,
    raw: true,
  });
}

async function sendStartupCommand(paneId: string, command: string): Promise<void> {
  await callHerdrSocket("pane.send_text", {
    pane_id: paneId,
    text: command,
  });
  await callHerdrSocket("pane.send_keys", {
    pane_id: paneId,
    keys: ["Enter"],
  });
}

async function closeWorkspace(workspaceId: string): Promise<void> {
  try {
    await callHerdrSocket("workspace.close", {
      workspace_id: workspaceId,
      force: true,
    });
  } catch (error) {
    console.error("warning: failed to close smoke workspace", error);
  }
}

async function main(): Promise<void> {
  const result = await spawnHerdrRoleSession({
    tileId: `smoke-${Date.now()}`,
    roleId: "hermes",
    roleName: "Hermes",
    cwd: process.cwd(),
    commandTemplate: `printf '${token}\\n'`,
    workspaceId: "quantflow-v2-smoke",
  });
  await sendStartupCommand(result.herdrPaneId, `printf '${token}\\n'`);

  let paneRead: Record<string, unknown> = {};
  let sawToken = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await delay(500);
    paneRead = await readPane(result.herdrPaneId);
    sawToken = JSON.stringify(paneRead).includes(token);
    if (sawToken) break;
  }

  const summary = {
    ok: sawToken,
    token,
    herdrAgentName: result.herdrAgentName,
    herdrWorkspaceId: result.herdrWorkspaceId,
    herdrPaneId: result.herdrPaneId,
    herdrTerminalId: result.herdrTerminalId,
    terminalTarget: result.terminalTarget,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (process.env.QF_KEEP_HERDR_SMOKE !== "1") {
    await closeWorkspace(result.herdrWorkspaceId);
  }

  if (!sawToken) {
    console.error("smoke failed: pane.read did not contain the token");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
