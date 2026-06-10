import { describe, expect, test } from "bun:test";
import {
	WORKFLOW_MODAL_COPY,
	normalizeWorkflowPrompt,
	renderWorkflowModalHtml,
	resolveWorkflowModalKeyAction,
} from "./workflow-modal.js";

describe("workflow modal copy and markup", () => {
	test("renders the operator question, input, and both actions", () => {
		const html = renderWorkflowModalHtml();
		expect(html).toContain(WORKFLOW_MODAL_COPY.title);
		expect(html).toContain("qf-workflow-input");
		expect(html).toContain(WORKFLOW_MODAL_COPY.submitLabel);
		expect(html).toContain(WORKFLOW_MODAL_COPY.cancelLabel);
		expect(html).toContain('role="dialog"');
	});
});

describe("normalizeWorkflowPrompt", () => {
	test("trims input and tolerates non-strings", () => {
		expect(normalizeWorkflowPrompt("  fix the build  ")).toBe("fix the build");
		expect(normalizeWorkflowPrompt(null)).toBe("");
		expect(normalizeWorkflowPrompt(undefined)).toBe("");
	});
});

describe("resolveWorkflowModalKeyAction", () => {
	test("Enter submits, Shift+Enter does not, Escape cancels", () => {
		expect(resolveWorkflowModalKeyAction("Enter", {})).toBe("submit");
		expect(resolveWorkflowModalKeyAction("Enter", { shiftKey: true })).toBeNull();
		expect(resolveWorkflowModalKeyAction("Escape", {})).toBe("cancel");
		expect(resolveWorkflowModalKeyAction("a", {})).toBeNull();
	});
});
