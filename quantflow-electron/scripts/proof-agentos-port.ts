/** Reserve an ephemeral loopback port for one isolated Electron proof run. */
export function reserveProofAgentOsPort(): number {
  const reservation = Bun.serve({
    port: 0,
    fetch: () => new Response("proof port reservation"),
  });
  const port = reservation.port;
  reservation.stop(true);
  return port;
}
