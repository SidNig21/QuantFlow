import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// When running in WSL with node_modules on a Windows drive (/mnt/c/...), bun
// may cache Windows-native esbuild binaries from a previous Windows install.
// These binaries are PE executables and fail with a version mismatch error when
// electron-vite tries to spawn them on Linux. Detect and remove them so bun
// re-fetches the correct Linux build before anything else runs.
function isRunningInWSL() {
  return !!(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

if (isRunningInWSL()) {
  const bunDir = join("node_modules", ".bun");
  if (existsSync(bunDir)) {
    const stale = readdirSync(bunDir).filter((d) => d.startsWith("esbuild@"));
    if (stale.length > 0) {
      for (const entry of stale) {
        rmSync(join(bunDir, entry), { recursive: true, force: true });
      }
      console.log(
        `WSL: removed ${stale.length} stale esbuild cache(s) — re-fetching Linux build...`,
      );
      execSync("bun install --ignore-scripts", { stdio: "inherit" });
    }
  }
}

// On Windows, node-pty's build files need two patches:
// 1. winpty.gyp uses bare .bat filenames in cmd /c calls. Modern Windows may
//    not resolve them without a .\ prefix.
// 2. Both binding.gyp and winpty.gyp require Spectre-mitigated libraries
//    which may not be installed in VS Build Tools.
if (process.platform === "win32") {
  const winptyGyp = join(
    "node_modules",
    "node-pty",
    "deps",
    "winpty",
    "src",
    "winpty.gyp"
  );
  if (existsSync(winptyGyp)) {
    let content = readFileSync(winptyGyp, "utf8");
    content = content.replace(
      /&& GetCommitHash\.bat/g,
      "&& .\\\\GetCommitHash.bat"
    );
    content = content.replace(
      /&& UpdateGenVersion\.bat/g,
      "&& .\\\\UpdateGenVersion.bat"
    );
    content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'");
    writeFileSync(winptyGyp, content);
    console.log("Patched winpty.gyp");
  }

  const bindingGyp = join("node_modules", "node-pty", "binding.gyp");
  if (existsSync(bindingGyp)) {
    let content = readFileSync(bindingGyp, "utf8");
    content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'");
    writeFileSync(bindingGyp, content);
    console.log("Patched binding.gyp");
  }

  const conptyAgentTs = join(
    "node_modules",
    "node-pty",
    "src",
    "conpty_console_list_agent.ts"
  );
  if (existsSync(conptyAgentTs)) {
    let content = readFileSync(conptyAgentTs, "utf8");
    content = content.replace(
      [
        "const consoleProcessList = getConsoleProcessList(shellPid);",
        "process.send!({ consoleProcessList });",
        "process.exit(0);",
      ].join("\n"),
      [
        "let consoleProcessList: number[];",
        "try {",
        "  consoleProcessList = getConsoleProcessList(shellPid);",
        "} catch {",
        "  // AttachConsole can fail during teardown races; fall back",
        "  // to the shell pid so the parent can continue cleanup.",
        "  consoleProcessList = [shellPid];",
        "}",
        "process.send!({ consoleProcessList });",
        "process.exit(0);",
      ].join("\n")
    );
    writeFileSync(conptyAgentTs, content);
    console.log("Patched conpty_console_list_agent.ts");
  }

  const conptyAgentJs = join(
    "node_modules",
    "node-pty",
    "lib",
    "conpty_console_list_agent.js"
  );
  if (existsSync(conptyAgentJs)) {
    let content = readFileSync(conptyAgentJs, "utf8");
    content = content.replace(
      [
        "var consoleProcessList = getConsoleProcessList(shellPid);",
        "process.send({ consoleProcessList: consoleProcessList });",
        "process.exit(0);",
      ].join("\n"),
      [
        "var consoleProcessList;",
        "try {",
        "    consoleProcessList = getConsoleProcessList(shellPid);",
        "}",
        "catch (_a) {",
        "    // AttachConsole can fail during teardown races; fall back",
        "    // to the shell pid so the parent can continue cleanup.",
        "    consoleProcessList = [shellPid];",
        "}",
        "process.send({ consoleProcessList: consoleProcessList });",
        "process.exit(0);",
      ].join("\n")
    );
    writeFileSync(conptyAgentJs, content);
    console.log("Patched conpty_console_list_agent.js");
  }
}

execSync("bun x electron-rebuild -f -w node-pty", { stdio: "inherit" });
