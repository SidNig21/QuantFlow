import { beforeEach, describe, expect, mock, test } from "bun:test";

function createStyle() {
  const values = new Map();
  return {
    setProperty(name, value) {
      values.set(name, String(value));
    },
    getPropertyValue(name) {
      return values.get(name) ?? "";
    },
  };
}

function createClassList() {
  const values = new Set();
  return {
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createElement(tagName) {
  const children = [];
  const attributes = new Map();
  const listeners = new Map();
  return {
    tagName: String(tagName).toUpperCase(),
    id: "",
    children,
    parentNode: null,
    style: createStyle(),
    classList: createClassList(),
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    getBoundingClientRect() {
      return {
        width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0,
      };
    },
  };
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findById(child, id);
    if (match) return match;
  }
  return null;
}

function installDomStub() {
  const documentElement = createElement("html");
  const body = createElement("body");
  documentElement.appendChild(body);
  body.innerHTML = "";
  globalThis.document = {
    documentElement,
    body,
    createElement,
    getElementById(id) {
      return findById(documentElement, id);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {};
  globalThis.getComputedStyle = (el) => el.style;
}

function makePanel(id) {
  const el = document.createElement("div");
  el.id = id;
  el.getBoundingClientRect = () => ({
    width: 280, height: 600, top: 0, left: 0, right: 280, bottom: 600,
  });
  return el;
}

function makeButton(id) {
  const btn = document.createElement("button");
  btn.id = id;
  return btn;
}

describe("createPanel", () => {
  let panel, resizeHandle, toggle, viewer, panelsEl;

  beforeEach(() => {
    installDomStub();
    document.body.innerHTML = "";
    panelsEl = document.createElement("div");
    panelsEl.id = "panels";
    panelsEl.getBoundingClientRect = () => ({
      width: 1200, height: 600, top: 0, left: 0, right: 1200, bottom: 600,
    });
    document.body.appendChild(panelsEl);

    panel = makePanel("panel-nav");
    resizeHandle = document.createElement("div");
    resizeHandle.id = "nav-resize";
    toggle = makeButton("nav-toggle");
    viewer = makePanel("panel-viewer");

    panelsEl.appendChild(panel);
    panelsEl.appendChild(resizeHandle);
    panelsEl.appendChild(viewer);
    document.body.appendChild(toggle);

    // Stub CSS custom properties
    document.documentElement.style.setProperty("--panel-nav-min", "100");
    document.documentElement.style.setProperty("--panel-nav-max", "1000");
    document.documentElement.style.setProperty("--panel-terminal-min", "100");
    document.documentElement.style.setProperty("--panel-terminal-max", "1000");

    // Stub shellApi
    window.shellApi = {
      setPref: mock(() => {}),
      getPref: mock(async () => null),
    };
  });

  test("starts visible by default", async () => {
    const { createPanel } = await import("./panel-manager.js");
    const mgr = createPanel("nav", {
      panel, viewer, resizeHandle, toggle,
      label: "Navigator",
      defaultWidth: 280,
      direction: 1,
    });
    mgr.initPrefs(null, null);
    expect(mgr.isVisible()).toBe(true);
  });

  test("toggles visibility", async () => {
    const { createPanel } = await import("./panel-manager.js");
    const mgr = createPanel("nav", {
      panel, viewer, resizeHandle, toggle,
      label: "Navigator",
      defaultWidth: 280,
      direction: 1,
    });
    mgr.initPrefs(null, null);
    mgr.toggle();
    expect(mgr.isVisible()).toBe(false);
    expect(window.shellApi.setPref).toHaveBeenCalledWith(
      "sidebar-mode", "closed",
    );
  });

  test("persists width on pref key panel-width-{side}", async () => {
    const { createPanel } = await import("./panel-manager.js");
    const mgr = createPanel("nav", {
      panel, viewer, resizeHandle, toggle,
      label: "Navigator",
      defaultWidth: 280,
      direction: 1,
    });
    mgr.initPrefs(350, true);
    mgr.applyVisibility();
    expect(panel.style.flex).toBe("0 0 350px");
  });

  test("uses direction=-1 for right panels", async () => {
    const { createPanel } = await import("./panel-manager.js");
    const termPanel = makePanel("panel-terminal");
    const termResize = document.createElement("div");
    const termToggle = makeButton("terminal-toggle");
    panelsEl.appendChild(termResize);
    panelsEl.appendChild(termPanel);
    document.body.appendChild(termToggle);

    const mgr = createPanel("terminal", {
      panel: termPanel, viewer, resizeHandle: termResize,
      toggle: termToggle,
      label: "Terminals",
      defaultWidth: 240,
      direction: -1,
    });
    mgr.initPrefs(null, null);
    expect(mgr.isVisible()).toBe(true);
  });
});
