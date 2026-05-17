import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
  lstatSync,
  realpathSync,
} from "fs";
import { join } from "path";
import { execSync } from "child_process";

function removeIfExists(path, reason) {
  try {
    lstatSync(path);
  } catch (err) {
    if (!["EACCES", "EPERM"].includes(err?.code)) return false;
  }
  rmSync(path, { recursive: true, force: true });
  console.log(`${reason}: removed ${path}`);
  return true;
}

function cleanupForeignEsbuildLinks() {
  const scopedDir = join("node_modules", ".bun", "node_modules", "@esbuild");
  if (!existsSync(scopedDir)) return;

  const keepPrefix = process.platform === "win32"
    ? "win32-"
    : process.platform === "darwin"
      ? "darwin-"
      : "linux-";

  for (const entry of readdirSync(scopedDir)) {
    if (entry.startsWith(keepPrefix)) continue;
    removeIfExists(
      join(scopedDir, entry),
      "postinstall: removed foreign esbuild optional dependency",
    );
  }
}

function cleanupBrokenBunModuleLinks() {
  const root = join("node_modules", ".bun", "node_modules");
  if (!existsSync(root)) return;

  const candidates = [];
  for (const entry of readdirSync(root)) {
    const entryPath = join(root, entry);
    if (entry.startsWith("@")) {
      try {
        for (const scopedEntry of readdirSync(entryPath)) {
          candidates.push(join(entryPath, scopedEntry));
        }
      } catch {
        candidates.push(entryPath);
      }
    } else {
      candidates.push(entryPath);
    }
  }

  for (const candidate of candidates) {
    try {
      realpathSync.native(candidate);
    } catch (err) {
      if (!["EACCES", "ENOENT", "EPERM"].includes(err?.code)) continue;
      removeIfExists(
        candidate,
        "postinstall: removed broken bun optional dependency link",
      );
    }
  }
}

// When running in WSL with node_modules on a Windows drive (/mnt/c/...), bun
// may cache Windows-native esbuild binaries from a previous Windows install.
// These binaries are PE executables and fail with a version mismatch error when
// electron-vite tries to spawn them on Linux. Detect and remove them so bun
// re-fetches the correct Linux build before anything else runs.
function isRunningInWSL() {
  return !!(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

function clearStaleEsbuildCaches(label) {
  const bunDir = join("node_modules", ".bun");
  if (!existsSync(bunDir)) return;
  const stale = readdirSync(bunDir).filter((d) => d.startsWith("esbuild@"));
  if (stale.length === 0) return;
  for (const entry of stale) {
    const fullPath = join(bunDir, entry);
    if (process.platform === "win32") {
      try {
        execSync(`cmd /c rd /s /q "${fullPath}"`, { stdio: "pipe" });
      } catch {
        // Non-fatal — proceed and let re-fetch overwrite.
      }
    } else {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }
  console.log(`${label}: removed ${stale.length} stale esbuild cache(s) — re-fetching...`);
  execSync("bun install --ignore-scripts", { stdio: "inherit" });
}

if (isRunningInWSL()) {
  clearStaleEsbuildCaches("WSL");
}

// Same stale-cache problem occurs on Windows: a previous install may have left an
// old esbuild@0.x.y directory in .bun/ that mismatches the version bun just
// resolved. Clear it and re-fetch before anything spawns the esbuild binary.
if (process.platform === "win32") {
  clearStaleEsbuildCaches("Windows");
}

// On Windows, bun (especially when invoked from a WSL context on a Windows-mounted
// drive) installs Linux-only optional packages into node_modules/@img, @rollup,
// @parcel, @tailwindcss, and lightningcss-linux-*. cleanupBrokenBunModuleLinks
// removes the .bun/ symlinks but leaves the real directories in node_modules/.
// electron-rebuild then tries to realpath() those directories and fails with
// EACCES because WSL created them with Linux-mode ACLs that Windows cannot read.
// Use cmd /c rd (which bypasses Node.js ACL restrictions) to remove them before
// electron-rebuild runs.
function cleanupLinuxNativePackages() {
  if (process.platform !== "win32") return;

  // @img/sharp-* are ALL Linux-only native packages — safe to nuke entirely.
  const imgDir = join("node_modules", "@img");
  try {
    if (existsSync(imgDir)) {
      execSync(`cmd /c rd /s /q "${imgDir}"`, { stdio: "pipe" });
      console.log("postinstall: removed Linux-only @img packages");
    }
  } catch {
    // Non-fatal: electron-rebuild may still succeed without it.
  }

  // For scoped packages that mix platform variants, only remove linux entries.
  const selectiveScopes = [
    join("node_modules", "@rollup"),
    join("node_modules", "@parcel"),
    join("node_modules", "@tailwindcss"),
  ];
  for (const dir of selectiveScopes) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.includes("linux")) continue;
      try {
        execSync(`cmd /c rd /s /q "${join(dir, entry)}"`, { stdio: "pipe" });
        console.log(`postinstall: removed Linux-only package: ${join(dir, entry)}`);
      } catch {
        // Non-fatal.
      }
    }
  }

  // lightningcss-linux-* lives at the top level of node_modules.
  let topEntries;
  try {
    topEntries = readdirSync("node_modules");
  } catch {
    topEntries = [];
  }
  for (const entry of topEntries) {
    if (!entry.startsWith("lightningcss-linux")) continue;
    try {
      execSync(`cmd /c rd /s /q "${join("node_modules", entry)}"`, { stdio: "pipe" });
      console.log(`postinstall: removed Linux-only package: ${join("node_modules", entry)}`);
    } catch {
      // Non-fatal.
    }
  }
}

// Bun can leave cross-platform optional package junctions under
// node_modules/.bun/node_modules/@esbuild. On Windows, electron-rebuild walks
// every package before selecting node-pty and fails if a foreign junction points
// at a missing target (seen with @esbuild/linux-x64). Remove foreign esbuild
// links before the rebuild; bun will recreate the platform package it needs.
cleanupLinuxNativePackages();
cleanupForeignEsbuildLinks();
cleanupBrokenBunModuleLinks();

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

execSync("bun x electron-rebuild -f -w node-pty -w better-sqlite3", { stdio: "inherit" });
