# QuantFlow — Retirement Register

## Retired with `retirement-v1-relay` commit

- `string-relay.ts` and full relay cluster — deleted
- `notifyStringRelay` removed from `pty.ts`
- `ipc-string-relay.ts` unregistered; tile/watchtower IPC moved to `ipc-tile-registry.ts`
- `herdr-routes.ts` routing (`routeViaHerdr`, `shouldRouteViaHerdr`) — deleted; pane-link registration kept

## Pending `retirement-herdr-cli`

- `herdr-bridge.ts` — waiting on `ipc-herdr.ts` port to socket
- `ipc-herdr.ts` CLI handlers — port to socket first

## Do not delete yet

- Watchtower 2s polling in `renderer.js` — wait for Gate 3 replacement
- `smart-strings-repo.ts` — wait for A2A slice
- `herdr:read` IPC — keep for debug until socket equivalent

## Never re-extend

- Any file in the deleted relay cluster
- `pane.read` as display mechanism
- Direct `envoy-stub` calls
