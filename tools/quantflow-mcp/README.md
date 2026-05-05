# QuantFlow MCP

Stdio MCP server for Hermes Agent to control QuantFlow through the in-app JSON-RPC TCP relay.

QuantFlow must be running. The Electron app starts the relay automatically on `127.0.0.1:9811`.

Hermes config shape:

```json
{
  "mcpServers": {
    "quantflow": {
      "command": "node",
      "args": ["C:\\Users\\rybow\\QuantFlow\\tools\\quantflow-mcp\\server.js"]
    }
  }
}
```

From WSL, the server detects the Windows host through `/etc/resolv.conf`. Override with:

```sh
QUANTFLOW_RELAY_HOST=127.0.0.1 QUANTFLOW_RELAY_PORT=9811 node server.js
```

Install dependencies before first use:

```sh
npm install
```

Smoke-test against a running QuantFlow app:

```sh
npm run smoke:relay
```

The smoke checks relay health and required JSON-RPC methods. Add `-- --workflow` to also exercise the Priority 1 acceptance workflow against the live canvas by creating Hermes, Worker, and Shell tiles, wiring two cables, sending a one-shot delegation, reading worker output, and then cleaning up the created tiles.
