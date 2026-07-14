/** WSL path to envoy-run.sh (QuantFlow repo on this machine). */
export const ENVOY_RUN_SCRIPT_WSL =
  "/mnt/c/Users/rybow/QuantFlow/quantflow-electron/scripts/envoy-run.sh";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildEnvoyWrappedCommand(params: {
  command: string;
  envoySpaceId: string;
  envoyProfile: string;
}): string {
  const command = params.command.trim();
  const space = shellQuote(params.envoySpaceId);
  const profile = shellQuote(params.envoyProfile);
  const escaped = command.replace(/'/g, "'\\''");
  return `ENVOY_SPACE=${space} ENVOY_PROFILE=${profile} bash ${ENVOY_RUN_SCRIPT_WSL} bash -lc '${escaped}'`;
}
