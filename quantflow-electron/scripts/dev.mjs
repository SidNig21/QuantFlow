import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

function normalizeWindowsPath(path) {
  if (process.platform !== "win32") return path;
  if (path.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${path.slice("\\\\?\\UNC\\".length)}`;
  }
  if (path.startsWith("\\\\?\\")) {
    return path.slice("\\\\?\\".length);
  }
  return path;
}

function isWSL() {
  return !!(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

// Convert a WSL Linux path (/mnt/c/...) to a Windows path (C:\...) using wslpath.
function wslToWindowsPath(linuxPath) {
  try {
    const result = spawnSync("wslpath", ["-w", linuxPath], { encoding: "utf8" });
    if (result.status === 0) return result.stdout.trim();
  } catch {}
  // Fallback: naive /mnt/X/ → X:\ substitution
  return linuxPath.replace(/^\/mnt\/([a-z])\//, (_, d) => `${d.toUpperCase()}:\\`).replace(/\//g, "\\");
}

const repoDir = normalizeWindowsPath(process.cwd());

const useWindowsPath = process.platform === "win32" || isWSL();

const child = useWindowsPath
  ? spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        // dev.ps1 uses $PSScriptRoot to compute its own paths; it only needs
        // to find itself. Convert the script path to a Windows path when in WSL.
        isWSL()
          ? wslToWindowsPath(join(repoDir, "scripts", "dev.ps1"))
          : join(repoDir, "scripts", "dev.ps1"),
      ],
      {
        stdio: "inherit",
        cwd: isWSL() ? wslToWindowsPath(repoDir) : repoDir,
        env: {
          ...process.env,
          COLLAB_DEV_WORKTREE_ROOT: isWSL() ? wslToWindowsPath(repoDir) : repoDir,
        },
      },
    )
  : spawn(process.execPath, ["x", "electron-vite", "dev"], {
      stdio: "inherit",
      cwd: repoDir,
      env: {
        ...process.env,
        COLLAB_DEV_WORKTREE_ROOT: repoDir,
      },
    });

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
