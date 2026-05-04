import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../../..");

describe("QuantFlow release identity", () => {
  test("publishes packaged builds to the QuantFlow repository", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "collab-electron/package.json"), "utf8"),
    );

    expect(pkg.name).toBe("@quantflow/electron");
    expect(pkg.build.appId).toBe("com.quantflow.desktop");
    expect(pkg.build.productName).toBe("QuantFlow");
    expect(pkg.build.publish).toEqual([
      {
        provider: "github",
        owner: "SidNig21",
        repo: "QuantFlow",
      },
    ]);
  });

  test("command-line installer fetches QuantFlow releases", () => {
    const installScript = readFileSync(join(repoRoot, "install.sh"), "utf8");

    expect(installScript).toContain('APP_NAME="QuantFlow"');
    expect(installScript).toContain('REPO="SidNig21/QuantFlow"');
    expect(installScript).toContain('${APP_NAME}.app');
    expect(installScript).toContain('/quantflow"');
    expect(installScript).not.toContain("collaborator-ai/collab-public");
    expect(installScript).not.toContain("Collaborator.app");
  });
});
