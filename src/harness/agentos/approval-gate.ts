/**
 * Approval bridge — toolkit approval-request and ACP onPermissionRequest both
 * route through the same injected gate. The host wires this to kernel.checkpoint
 * create + block until human_decision; tests use the sim gate below.
 */

export interface ApprovalRequest {
  requestId: string;
  action: string;
  source: 'toolkit' | 'acp';
  toolCallId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ApprovalResult {
  approved: boolean;
  blockedMs: number;
}

export interface ApprovalGate {
  request(input: ApprovalRequest): Promise<ApprovalResult>;
}

export interface SimApprovalGate extends ApprovalGate {
  readonly records: Array<ApprovalRequest & ApprovalResult & { startedAt: number }>;
}

export function createSimApprovalGate(autoApproveAfterMs = 50): SimApprovalGate {
  const records: SimApprovalGate['records'] = [];

  return {
    records,
    async request(input: ApprovalRequest): Promise<ApprovalResult> {
      const startedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, autoApproveAfterMs));
      const blockedMs = Date.now() - startedAt;
      const result = { approved: true, blockedMs };
      records.push({ ...input, ...result, startedAt });
      return result;
    },
  };
}
