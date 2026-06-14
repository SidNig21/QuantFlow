export interface CommandResult {
  ok: boolean;
  id?: string;
  error?: string;
  data?: unknown;
}
