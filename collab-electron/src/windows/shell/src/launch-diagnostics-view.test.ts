import { describe, expect, test } from "bun:test";
import {
	createPtyStartFailureDiagnostic,
	escapeDiagnosticHtml,
	normalizeLaunchDiagnostics,
	renderLaunchDiagnostics,
} from "./launch-diagnostics-view.js";

describe("launch diagnostics view", () => {
	test("normalizes runtime diagnostics with visible actions", () => {
		const diagnostics = normalizeLaunchDiagnostics([
			{
				id: "missing-bun",
				severity: "warn",
				title: "Bun is not on PATH",
				message: "Install bun.",
				action: "copy",
				actionLabel: "Copy install command",
				fixCommand: "bun --version",
			},
			{
				id: "missing-shell",
				severity: "error",
				title: "Default shell missing",
				message: "Open settings.",
				action: "settings",
			},
		]);

		expect(diagnostics).toEqual([
			{
				id: "missing-bun",
				severity: "warn",
				title: "Bun is not on PATH",
				message: "Install bun.",
				action: "copy",
				actionLabel: "Copy install command",
				fixCommand: "bun --version",
			},
			{
				id: "missing-shell",
				severity: "error",
				title: "Default shell missing",
				message: "Open settings.",
				action: "settings",
				actionLabel: "Open settings",
				fixCommand: "",
			},
		]);
	});

	test("creates a settings action for PTY start failures", () => {
		expect(createPtyStartFailureDiagnostic(
			{ message: "spawn ENOENT", tileId: "tile-a" },
			{ id: "tile-a", userTitle: "Reviewer" },
		)).toMatchObject({
			id: "pty-start-failed:tile-a",
			severity: "error",
			title: "PTY start failed",
			message: "Reviewer: spawn ENOENT",
			action: "settings",
			actionLabel: "Open settings",
		});
	});

	test("escapes rendered diagnostic content", () => {
		expect(escapeDiagnosticHtml(`<script data-x="1">'&</script>`)).toBe(
			"&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;&lt;/script&gt;",
		);
		const html = renderLaunchDiagnostics([
			{
				id: "missing-role:<x>",
				title: "<Codex>",
				message: "Install & retry",
				actionLabel: "Copy <command>",
			},
		]);
		expect(html).toContain("&lt;Codex&gt;");
		expect(html).toContain("Install &amp; retry");
		expect(html).toContain("Copy &lt;command&gt;");
		expect(html).not.toContain("<Codex>");
	});
});
