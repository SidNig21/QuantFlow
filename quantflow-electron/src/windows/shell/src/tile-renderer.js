import { splitDisplayPath } from "@collab/shared/path-utils";

/**
 * Turns arbitrary input into a navigable URL.
 * If the input looks like a URL (has a scheme or a recognized TLD),
 * return it (prepending https:// when needed). Otherwise treat it as
 * a Google search query.
 */
function resolveInput(raw) {
  const s = raw.trim();
  if (!s) return "";

  // Already has a scheme
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;

  // Looks like a domain (with TLD), optionally followed by path/query
  if (/^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return `https://${s}`;

  // Anything else → Google search
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

export function formatContextPreviewDetail(preview) {
  const files = Array.isArray(preview?.files) ? preview.files : [];
  const sortedFiles = [
    ...files.filter((file) => file.omitted || file.truncated || file.ok === false),
    ...files.filter((file) => !(file.omitted || file.truncated || file.ok === false)),
  ];
  const fileLines = sortedFiles.slice(0, 5).map((file) => {
    const status = file.ok === false
      ? "unreadable"
      : file.truncated ? "truncated"
        : file.omitted ? "partial" : "included";
    const mode = file.mode ? ` (${file.mode})` : "";
    const warning = file.error ? ` - ${file.error}` : "";
    return `${status}${mode}: ${file.path}${warning}`;
  });
  const hiddenCount = Math.max(0, files.length - fileLines.length);
  const warningFiles = files.filter((file) =>
    file.omitted || file.truncated || file.ok === false
  ).length;
  const lines = [
    `${files.length} pinned files, ${preview?.decisionsCount ?? 0} decisions`,
    `${preview?.injectedChars ?? 0} chars injected of ${preview?.maxChars ?? 0} max`,
  ];
  if (preview?.truncated) {
    lines.push("context truncated to fit the configured limit");
  }
  if (warningFiles > 0) {
    lines.push(`${warningFiles} files partial, truncated, omitted, or unreadable`);
  }
  if (preview?.omittedDecisionCount > 0) {
    lines.push(`${preview.omittedDecisionCount} decisions omitted or truncated`);
  }
  lines.push(...fileLines);
  if (hiddenCount > 0) {
    lines.push(`${hiddenCount} more files`);
  }
  return lines.join("\n");
}

const CONTEXT_MODE_LABELS = {
  full: "Full file",
  "summary-header": "Summary header",
  excerpt: "Excerpt",
};

export function normalizeContextIncludeMode(mode) {
  return mode === "summary-header" || mode === "excerpt" ? mode : "full";
}

export function formatContextPinMenuLabel(pin, previewFile = null) {
  const mode = normalizeContextIncludeMode(pin?.mode);
  const status = previewFile?.ok === false
    ? "unreadable"
    : previewFile?.truncated ? "truncated"
      : previewFile?.omitted ? "partial" : "ready";
  const path = String(pin?.path ?? "").trim() || "(missing path)";
  return `${CONTEXT_MODE_LABELS[mode]} - ${path} (${status})`;
}

async function showSharedContextPreview() {
  const preview = await window.shellApi.contextPreviewForTile?.();
  const detail = preview
    ? formatContextPreviewDetail(preview)
    : "No shared context preview is available.";
  await window.shellApi.showConfirmDialog?.({
    message: "Shared context preview",
    detail,
    buttons: ["Close"],
  });
}

async function pinSharedContextFile() {
  const filePath = await window.shellApi.vaultPickFile?.();
  if (!filePath) return;
  await window.shellApi.contextPinFile?.(filePath);
  await showSharedContextPreview();
}

async function manageSharedContextPins() {
  const ctx = await window.shellApi.contextGet?.();
  const pins = Array.isArray(ctx?.pinnedFiles) ? ctx.pinnedFiles : [];
  if (pins.length === 0) {
    await window.shellApi.showConfirmDialog?.({
      message: "No shared context pins",
      detail: "No pinned files.",
      buttons: ["Close"],
    });
    return;
  }

  const preview = await window.shellApi.contextPreviewForTile?.();
  const files = Array.isArray(preview?.files) ? preview.files : [];
  const previewByPath = new Map(files.map((file) => [file.path, file]));
  const selected = await window.shellApi.showContextMenu?.(
    pins.map((pin, index) => ({
      id: `pin:${index}`,
      label: formatContextPinMenuLabel(pin, previewByPath.get(pin.path)),
    })),
  );
  if (!selected?.startsWith("pin:")) return;
  const pin = pins[Number(selected.slice(4))];
  if (!pin?.path) return;

  const action = await window.shellApi.showContextMenu?.([
    { id: "full", label: "Use full file" },
    { id: "summary-header", label: "Use summary header" },
    { id: "excerpt", label: "Use excerpt" },
    { id: "separator", label: "" },
    { id: "unpin", label: "Unpin file" },
  ]);
  if (!action) return;

  if (action === "unpin") {
    await window.shellApi.contextUnpinFile?.(pin.path);
  } else if (action === "excerpt") {
    const current = typeof pin.excerpt === "string" ? pin.excerpt : "";
    const excerpt = prompt("Excerpt to include:", current);
    if (excerpt === null) return;
    await window.shellApi.contextSetFileMode?.(pin.path, "excerpt", excerpt);
  } else {
    await window.shellApi.contextSetFileMode?.(
      pin.path,
      normalizeContextIncludeMode(action),
    );
  }

  await showSharedContextPreview();
}

export function formatRelaySyntax(routeHandle) {
  const handle = String(routeHandle ?? "").trim().replace(/^@+/, "");
  return handle ? `>>@${handle}: ` : "";
}

export function getCablePortMetadata(tile, side = "E") {
  if (tile?.type !== "term") return null;
  const label = getTileLabel(tile).name || "terminal";
  const sideName = { N: "top", E: "right", S: "bottom", W: "left" }[side] ?? "right";
  return {
    title: `Drag cable from ${sideName} port to another terminal`,
    tooltip: `Drag cable from ${sideName}`,
    shortcut: "C",
    ariaLabel: `Drag cable from ${label} ${sideName} port to another terminal`,
  };
}

export const CABLE_PORT_SIDES = ["N", "E", "S", "W"];

/**
 * Creates the DOM structure for a tile.
 * @param {import('./canvas-state.js').Tile} tile
 * @param {object} callbacks
 * @param {(id: string) => void} callbacks.onClose
 * @param {(id: string, e?: MouseEvent) => void} callbacks.onFocus
 * @param {((id: string) => void)|null} [callbacks.onOpenInViewer]
 * @param {((id: string, url: string) => void)|null} [callbacks.onNavigate]
 * @param {((id: string) => void)|null} [callbacks.onRename]
 * @param {((id: string) => void)|null} [callbacks.onDuplicate]
 * @param {((id: string, side: 'N'|'E'|'S'|'W', e: MouseEvent) => void)|null} [callbacks.onCablePortMouseDown]
 */
export function createTileDOM(tile, callbacks) {
  const container = document.createElement("div");
  container.className = "canvas-tile";
  container.dataset.tileId = tile.id;
  container.dataset.tileType = tile.type;
  if (isTileRunning(tile)) container.dataset.running = "true";

  const titleBar = document.createElement("div");
  titleBar.className = "tile-title-bar";
  if (tile.roleColor) {
    titleBar.style.setProperty("--role-color", tile.roleColor);
    titleBar.classList.add("tile-title-bar--role");
  }

  const titleText = document.createElement("span");
  titleText.className = "tile-title-text";
  const label = getTileLabel(tile);
  const parentSpan = document.createElement("span");
  parentSpan.className = "tile-title-parent";
  parentSpan.textContent = label.parent;
  const nameSpan = document.createElement("span");
  nameSpan.className = "tile-title-name";
  nameSpan.textContent = label.name;
  titleText.appendChild(parentSpan);
  titleText.appendChild(nameSpan);
  const roleBadge = createTileRoleBadge(tile);
  if (roleBadge) titleText.appendChild(roleBadge);
  const shellBadge = createTileShellBadge(tile);
  if (shellBadge) titleText.appendChild(shellBadge);
  if (tile.type === "term" && tile.routeHandle) {
    const handleSpan = document.createElement("span");
    handleSpan.className = "tile-route-handle";
    handleSpan.textContent = `@${tile.routeHandle}`;
    titleText.appendChild(handleSpan);
  }
  const statusBadge = createTileStatusBadge(tile);
  if (statusBadge) titleText.appendChild(statusBadge);
  if (tile.filePath) titleText.title = tile.filePath;
  if (tile.folderPath) titleText.title = tile.folderPath;
  if (tile.routeHandle) titleText.title = `@${tile.routeHandle}`;
  titleBar.appendChild(titleText);

  // For browser tiles, add nav controls and a URL input to the title bar
  let urlInput;
  let navBack;
  let navForward;
  let navReload;
  if (tile.type === "browser") {
    const navGroup = document.createElement("div");
    navGroup.className = "tile-nav-group";

    navBack = document.createElement("button");
    navBack.className = "tile-nav-btn";
    navBack.title = "Back";
    navBack.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>`;
    navBack.disabled = true;
    navBack.addEventListener("mousedown", (e) => e.stopPropagation());

    navForward = document.createElement("button");
    navForward.className = "tile-nav-btn";
    navForward.title = "Forward";
    navForward.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>`;
    navForward.disabled = true;
    navForward.addEventListener("mousedown", (e) => e.stopPropagation());

    navReload = document.createElement("button");
    navReload.className = "tile-nav-btn";
    navReload.title = "Reload";
    navReload.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3v4h-4"/><path d="M12.36 10a5 5 0 1 1-.96-5.36L13 7"/></svg>`;
    navReload.addEventListener("mousedown", (e) => e.stopPropagation());

    navGroup.appendChild(navBack);
    navGroup.appendChild(navForward);
    navGroup.appendChild(navReload);
    titleBar.appendChild(navGroup);
    urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.className = "tile-url-input";
    urlInput.placeholder = "Search or enter URL...";
    urlInput.value = tile.url || "";
    if (tile.url) urlInput.readOnly = true;
    let dragOccurred = false;
    urlInput.addEventListener("mousedown", (e) => {
      dragOccurred = false;
      if (urlInput.readOnly) return;
      e.stopPropagation();
    });
    urlInput.addEventListener("mousemove", () => {
      dragOccurred = true;
    });
    urlInput.addEventListener("click", () => {
      if (urlInput.readOnly && !dragOccurred) {
        urlInput.readOnly = false;
        urlInput.select();
      }
    });
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const url = resolveInput(urlInput.value);
        if (url && callbacks.onNavigate) callbacks.onNavigate(tile.id, url);
        urlInput.readOnly = true;
        urlInput.blur();
      }
      if (e.key === "Escape") {
        urlInput.value = tile.url || "";
        urlInput.readOnly = true;
        urlInput.blur();
      }
    });
    urlInput.addEventListener("blur", () => {
      if (!urlInput.readOnly) {
        urlInput.value = tile.url || "";
        urlInput.readOnly = true;
      }
      window.getSelection()?.removeAllRanges();
    });
    titleText.style.display = "none";
  }

  const btnGroup = document.createElement("div");
  btnGroup.className = "tile-btn-group";

  const cablePorts = [];

  const copyablePath = tile.filePath || tile.folderPath;
  if (copyablePath) {
    const copySvg = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5V3.5A1.5 1.5 0 0 1 3.5 2h6A1.5 1.5 0 0 1 11 3.5V5"/></svg>`;
    const checkSvg = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 6.5 12 13 4"/></svg>`;
    const copyBtn = document.createElement("button");
    copyBtn.className = "tile-action-btn tile-copy-path-btn";
    copyBtn.innerHTML = copySvg;
    copyBtn.title = "Copy path";
    copyBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(copyablePath);
      copyBtn.innerHTML = checkSvg;
      setTimeout(() => { copyBtn.innerHTML = copySvg; }, 1000);
    });
    btnGroup.appendChild(copyBtn);
  }

  if (tile.filePath && callbacks.onOpenInViewer) {
    const viewBtn = document.createElement("button");
    viewBtn.className = "tile-action-btn tile-view-btn";
    viewBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s3-5.5 7-5.5S15 8 15 8s-3 5.5-7 5.5S1 8 1 8z"/><circle cx="8" cy="8" r="2.5"/></svg>`;
    viewBtn.title = "Open in viewer";
    viewBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onOpenInViewer(tile.id);
    });
    btnGroup.appendChild(viewBtn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "tile-action-btn tile-close-btn";
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "Close tile";
  closeBtn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onClose(tile.id, e);
  });
  btnGroup.appendChild(closeBtn);
  titleBar.appendChild(btnGroup);

  if (tile.type === "term") {
    titleBar.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const selected = await window.shellApi.showContextMenu([
        { id: "rename", label: "Rename" },
        { id: "duplicate", label: "Duplicate" },
        {
          id: "copy-relay-syntax",
          label: "Copy relay syntax",
          enabled: Boolean(tile.routeHandle),
        },
        { id: "inject-vault", label: "Inject vault file…" },
        { id: "pin-context-file", label: "Pin shared context file…" },
        { id: "manage-context", label: "Shared context pins…" },
        { id: "preview-context", label: "Preview shared context" },
        { id: "inject-context", label: "Inject shared context" },
      ]);
      if (selected === "rename" && callbacks.onRename) {
        callbacks.onRename(tile.id);
      } else if (selected === "duplicate" && callbacks.onDuplicate) {
        callbacks.onDuplicate(tile.id);
      } else if (selected === "copy-relay-syntax") {
        const syntax = formatRelaySyntax(tile.routeHandle);
        if (syntax) await navigator.clipboard.writeText(syntax);
      } else if (selected === "inject-vault") {
        try {
          const filePath = await window.shellApi.vaultPickFile?.();
          if (!filePath || !tile.ptySessionId) return;
          const content = await window.shellApi.vaultReadFile?.(filePath);
          if (!content) return;
          const fileName = filePath.split(/[\\/]/).pop() ?? "file";
          const header = `\n--- ${fileName} ---\n`;
          window.shellApi.ptyWrite(tile.ptySessionId, header + content + "\n");
        } catch (err) {
          console.warn("[vault] inject failed:", err);
        }
      } else if (selected === "pin-context-file") {
        try {
          await pinSharedContextFile();
        } catch (err) {
          console.warn("[context] pin failed:", err);
        }
      } else if (selected === "manage-context") {
        try {
          await manageSharedContextPins();
        } catch (err) {
          console.warn("[context] manage failed:", err);
        }
      } else if (selected === "preview-context") {
        try {
          await showSharedContextPreview();
        } catch (err) {
          console.warn("[context] preview failed:", err);
        }
      } else if (selected === "inject-context") {
        if (!tile.ptySessionId) return;
        try {
          const preview = await window.shellApi.contextPreviewForTile?.();
          if (!preview || !preview.injectedChars) return;
          const response = await window.shellApi.showConfirmDialog({
            message: "Inject shared context?",
            detail: formatContextPreviewDetail(preview),
            buttons: ["Cancel", "Inject"],
          });
          if (response !== 1) return;
          await window.shellApi.contextInjectToTile?.(tile.ptySessionId);
        } catch (err) {
          console.warn("[context] inject failed:", err);
        }
      }
    });
  }

  const contentArea = document.createElement("div");
  contentArea.className = "tile-content";

  const contentOverlay = document.createElement("div");
  contentOverlay.className = "tile-content-overlay";

  if (urlInput) titleBar.insertBefore(urlInput, btnGroup);

  container.appendChild(titleBar);
  container.appendChild(contentArea);
  contentArea.appendChild(contentOverlay);

  if (tile.type === "term") {
    for (const side of CABLE_PORT_SIDES) {
      const metadata = getCablePortMetadata(tile, side);
      const port = document.createElement("button");
      port.type = "button";
      port.className = "tile-port";
      port.dataset.side = side;
      port.dataset.tileId = tile.id;
      port.dataset.tooltip = metadata.tooltip;
      port.dataset.shortcut = metadata.shortcut;
      port.title = metadata.title;
      port.setAttribute("aria-label", metadata.ariaLabel);
      port.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        callbacks.onCablePortMouseDown?.(tile.id, side, e);
      });
      container.appendChild(port);
      cablePorts.push(port);
    }
  }

  return { container, titleBar, titleText, contentArea, contentOverlay, closeBtn, urlInput, navBack, navForward, navReload, cablePorts, cablePort: cablePorts[1] ?? null };
}

export function getTileLabel(tile) {
  if (tile.type === "term") {
    if (tile.userTitle) return { parent: "", name: tile.userTitle };
    if (tile.autoTitle) return splitFilepath(tile.autoTitle);
    if (tile.cwd) return splitFilepath(tile.cwd);
    return { parent: "", name: "Terminal" };
  }
  if (tile.type === "browser") {
    if (tile.url) {
      try { return { parent: "", name: new URL(tile.url).hostname }; }
      catch { return { parent: "", name: tile.url }; }
    }
    return { parent: "", name: "Browser" };
  }
  if (tile.type === "graph") {
    if (tile.folderPath) return splitFilepath(tile.folderPath);
    return { parent: "", name: "Graph" };
  }
  if (tile.filePath) return splitFilepath(tile.filePath);
  return { parent: "", name: tile.type };
}

export function splitFilepath(path) {
  return splitDisplayPath(path);
}

export function getTileStatusBadge(tile) {
  if (tile?.type !== "term") return null;
  if (tile.ptyStatus) return String(tile.ptyStatus);
  if (tile.ptySessionId) return "running";
  return "idle";
}

export function isTileRunning(tile) {
  if (tile?.type !== "term") return false;
  const status = String(tile.ptyStatus ?? "").toLowerCase();
  if (status === "running" || status === "active") return true;
  if (status === "idle" || status === "exited" || status === "error") return false;
  return Boolean(tile.ptySessionId);
}

export function getTileRoleBadge(tile) {
  if (tile?.type !== "term") return null;
  const roleName = String(tile.roleName ?? "").trim();
  if (roleName) return roleName;
  const roleId = String(tile.roleId ?? "").trim();
  return roleId || null;
}

export function getTileShellBadge(tile) {
  if (tile?.type !== "term") return null;
  const shellKind = String(tile.roleShellKind ?? "").trim();
  if (shellKind) return shellKind;
  const command = String(tile.roleCommandTemplate ?? "").trim();
  if (command) return command.split(/\s+/)[0];
  return null;
}

function createTileRoleBadge(tile) {
  const roleId = getTileRoleBadge(tile);
  if (!roleId) return null;
  const badge = document.createElement("span");
  badge.className = "tile-role-badge";
  badge.textContent = roleId;
  badge.title = `Role: ${roleId}`;
  return badge;
}

function createTileShellBadge(tile) {
  const shellKind = getTileShellBadge(tile);
  if (!shellKind) return null;
  const badge = document.createElement("span");
  badge.className = "tile-shell-badge";
  badge.textContent = shellKind;
  badge.title = `Shell: ${shellKind}`;
  return badge;
}

function createTileStatusBadge(tile) {
  const status = getTileStatusBadge(tile);
  if (!status) return null;
  const badge = document.createElement("span");
  badge.className = "tile-status-badge";
  badge.dataset.status = status;
  badge.textContent = status;
  return badge;
}

/**
 * Creates a herdr agent-status badge for tiles linked to a herdr pane.
 * The badge is identified by the class `tile-herdr-badge` so the polling
 * loop can update it in place without rebuilding the full title.
 */
function createHerdrBadge(tile) {
  if (!tile.herdrPaneId) return null;
  const badge = document.createElement("span");
  badge.className = "tile-herdr-badge";
  badge.dataset.status = "unknown";
  badge.dataset.paneId = tile.herdrPaneId;
  // Short pane ID label: last 6 chars only, e.g. "c41-1"
  const shortId = tile.herdrPaneId.slice(-6);
  badge.textContent = `herdr:${shortId}`;
  badge.title = `herdr pane ${tile.herdrPaneId}`;
  return badge;
}

/**
 * Updates an existing herdr badge's visual status in place.
 * Called by the polling loop — avoids a full title re-render.
 */
export function updateHerdrBadge(container, paneId, status) {
  const badge = container.querySelector(`.tile-herdr-badge[data-pane-id="${paneId}"]`);
  if (!badge) return;
  badge.dataset.status = status;
  badge.title = `herdr pane ${paneId} — ${status}`;
}

export function updateTileTitle(dom, tile) {
  const container = dom.container ?? dom;
  container.dataset.running = isTileRunning(tile) ? "true" : "false";
  const label = getTileLabel(tile);
  const titleText = dom.titleText;
  titleText.textContent = "";
  const parentSpan = document.createElement("span");
  parentSpan.className = "tile-title-parent";
  parentSpan.textContent = label.parent;
  const nameSpan = document.createElement("span");
  nameSpan.className = "tile-title-name";
  nameSpan.textContent = label.name;
  titleText.appendChild(parentSpan);
  titleText.appendChild(nameSpan);
  const roleBadge = createTileRoleBadge(tile);
  if (roleBadge) titleText.appendChild(roleBadge);
  const shellBadge = createTileShellBadge(tile);
  if (shellBadge) titleText.appendChild(shellBadge);
  if (tile.type === "term" && tile.routeHandle) {
    const handleSpan = document.createElement("span");
    handleSpan.className = "tile-route-handle";
    handleSpan.textContent = `@${tile.routeHandle}`;
    titleText.appendChild(handleSpan);
  }
  const herdrBadge = createHerdrBadge(tile);
  if (herdrBadge) titleText.appendChild(herdrBadge);
  const statusBadge = createTileStatusBadge(tile);
  if (statusBadge) titleText.appendChild(statusBadge);
  titleText.title = tile.routeHandle
    ? `@${tile.routeHandle}`
    : tile.filePath || tile.folderPath || tile.cwd || "";
}

export function startInlineRename(dom, tile, onCommit) {
  const existing = dom.titleText.parentNode.querySelector(".tile-rename-input");
  if (existing) return;
  const titleText = dom.titleText;
  const currentLabel = getTileLabel(tile);
  const currentName = currentLabel.parent
    ? currentLabel.parent + currentLabel.name
    : currentLabel.name;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "tile-rename-input";
  input.value = tile.userTitle ?? currentName;
  titleText.style.display = "none";
  titleText.parentNode.insertBefore(input, titleText);
  input.select();
  input.focus();

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;
    const value = input.value.trim();
    input.remove();
    titleText.style.display = "";
    onCommit(value);
  }

  function cancel() {
    if (committed) return;
    committed = true;
    input.remove();
    titleText.style.display = "";
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
    e.stopPropagation();
  });
  input.addEventListener("blur", () => commit());
  input.addEventListener("mousedown", (e) => e.stopPropagation());
}

/**
 * Positions a tile container in screen coordinates.
 * @param {HTMLElement} container
 * @param {import('./canvas-state.js').Tile} tile
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 */
export function positionTile(container, tile, panX, panY, zoom) {
  const sx = tile.x * zoom + panX;
  const sy = tile.y * zoom + panY;

  container.style.left = `${sx}px`;
  container.style.top = `${sy}px`;
  container.style.width = `${tile.width}px`;
  container.style.height = `${tile.height}px`;
  container.style.transform = `scale(${zoom})`;
  container.style.transformOrigin = "top left";
  container.style.zIndex = String(tile.zIndex);
}

/**
 * Positions all tile containers.
 * @param {Map<string, {container: HTMLElement}>} tileDOMs
 * @param {import('./canvas-state.js').Tile[]} tiles
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 */
export function positionAllTiles(tileDOMs, tiles, panX, panY, zoom) {
  for (const tile of tiles) {
    const dom = tileDOMs.get(tile.id);
    if (dom) positionTile(dom.container, tile, panX, panY, zoom);
  }
}
