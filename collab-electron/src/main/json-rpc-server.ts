import {
  createServer,
  type Server,
  type Socket,
} from "node:net";
import {
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { QUANTFLOW_HOME } from "./paths";
import {
  cleanupEndpoint,
  makeEndpointPath,
  prepareEndpoint,
} from "./ipc-endpoint";

const SOCKET_PATH = makeEndpointPath("ipc");
const DEFAULT_TCP_HOST = "0.0.0.0";
const DEFAULT_TCP_PORT = 9811;
// Write the breadcrumb to the base directory (~/.quantflow/)
// so the hook script can discover the socket regardless of
// whether the app is running in dev or prod mode.
const SOCKET_PATH_FILE = join(QUANTFLOW_HOME, "socket-path");
const NODE_PATH_FILE = join(QUANTFLOW_HOME, "node-path");

type MethodHandler = (
  params: unknown,
) => unknown | Promise<unknown>;

interface MethodEntry {
  handler: MethodHandler;
  description: string;
  params?: Record<string, string>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const methods = new Map<string, MethodEntry>();

function discoverMethods(): {
  name: string;
  description: string;
  params?: Record<string, string>;
}[] {
  return [...methods.entries()].map(([name, entry]) => ({
    name,
    description: entry.description,
    ...(entry.params ? { params: entry.params } : {}),
  }));
}
let socketServer: Server | null = null;
let tcpServer: Server | null = null;
const connections = new Set<Socket>();

export interface JsonRpcServerOptions {
  enableSocket?: boolean;
  tcpHost?: string;
  tcpPort?: number;
}

export interface JsonRpcServerInfo {
  socketPath?: string;
  tcp?: {
    host: string;
    port: number;
  };
}

function isJsonRpcRequest(obj: unknown): obj is JsonRpcRequest {
  if (typeof obj !== "object" || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  return (
    rec.jsonrpc === "2.0" &&
    (typeof rec.id === "number" || typeof rec.id === "string") &&
    typeof rec.method === "string"
  );
}

function makeErrorResponse(
  id: number | string | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(
  raw: string,
): Promise<JsonRpcResponse | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return makeErrorResponse(null, -32700, "Parse error");
  }

  if (!isJsonRpcRequest(parsed)) {
    return makeErrorResponse(null, -32600, "Invalid request");
  }

  const entry = methods.get(parsed.method);
  const handler = entry?.handler;
  if (!handler) {
    return makeErrorResponse(
      parsed.id,
      -32601,
      `Method not found: ${parsed.method}`,
    );
  }

  try {
    const result = await handler(parsed.params);
    return { jsonrpc: "2.0", id: parsed.id, result };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    return makeErrorResponse(parsed.id, -32000, message);
  }
}

function handleConnection(socket: Socket): void {
  connections.add(socket);
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString();

    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (line.length > 0) {
        void handleMessage(line).then((response) => {
          if (response && !socket.destroyed) {
            socket.write(JSON.stringify(response) + "\n");
          }
        });
      }

      newlineIdx = buffer.indexOf("\n");
    }
  });

  socket.on("close", () => {
    connections.delete(socket);
  });

  socket.on("error", (err) => {
    console.error("[json-rpc] Socket error:", err.message);
    connections.delete(socket);
  });
}

function makeMethodEntry(
  handler: MethodHandler,
  description: string,
  params?: Record<string, string>,
): MethodEntry {
  return {
    handler,
    description,
    ...(params ? { params } : {}),
  };
}

export function registerMethod(
  method: string,
  handler: MethodHandler,
  meta?: { description?: string; params?: Record<string, string> },
): void {
  methods.set(
    method,
    makeMethodEntry(
      handler,
      meta?.description ?? "",
      meta?.params,
    ),
  );
}

function listenServer(
  target: Server,
  listen: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      target.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      target.off("error", onError);
      resolve();
    };
    target.once("error", onError);
    target.once("listening", onListening);
    listen();
  });
}

export function getJsonRpcTcpAddress(): JsonRpcServerInfo["tcp"] | null {
  if (!tcpServer) return null;
  const address = tcpServer.address();
  if (!address || typeof address === "string") return null;
  return {
    host: address.address,
    port: address.port,
  };
}

export async function startJsonRpcServer(
  options: JsonRpcServerOptions = {},
): Promise<JsonRpcServerInfo> {
  const enableSocket = options.enableSocket ?? true;
  const tcpHost = options.tcpHost ?? DEFAULT_TCP_HOST;
  const tcpPort = options.tcpPort ?? DEFAULT_TCP_PORT;

  if (socketServer || tcpServer) {
    throw new Error("JSON-RPC server is already running");
  }

  registerMethod(
    "rpc.discover",
    () => ({ methods: discoverMethods() }),
    { description: "List all available RPC methods" },
  );

  const info: JsonRpcServerInfo = {};

  try {
    if (enableSocket) {
      mkdirSync(QUANTFLOW_HOME, { recursive: true });
      prepareEndpoint(SOCKET_PATH);

      socketServer = createServer(handleConnection);
      await listenServer(
        socketServer,
        () => socketServer!.listen(SOCKET_PATH),
      );

      writeFileSync(SOCKET_PATH_FILE, SOCKET_PATH, "utf-8");
      writeFileSync(NODE_PATH_FILE, process.execPath, "utf-8");
      console.log(`[json-rpc] Listening on ${SOCKET_PATH}`);
      info.socketPath = SOCKET_PATH;
    }

    tcpServer = createServer(handleConnection);
    await listenServer(
      tcpServer,
      () => tcpServer!.listen(tcpPort, tcpHost),
    );

    const tcpAddress = getJsonRpcTcpAddress();
    if (tcpAddress) {
      info.tcp = tcpAddress;
      console.log(
        `[json-rpc] TCP relay listening on ${tcpAddress.host}:${tcpAddress.port}`,
      );
    }

    return info;
  } catch (err) {
    stopJsonRpcServer();
    throw err;
  }
}

export function stopJsonRpcServer(): void {
  for (const socket of connections) {
    socket.destroy();
  }
  connections.clear();

  for (const srv of [socketServer, tcpServer]) {
    if (srv) {
      srv.close();
    }
  }
  socketServer = null;
  tcpServer = null;

  cleanupEndpoint(SOCKET_PATH);

  for (const f of [SOCKET_PATH_FILE, NODE_PATH_FILE]) {
    try {
      unlinkSync(f);
    } catch {
      // File already gone
    }
  }
}
