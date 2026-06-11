import { afterEach, describe, expect, test } from "bun:test";
import {
  ensureHerdrServer,
  getHerdrBootstrapResult,
  shouldSkipHerdrBootstrap,
} from "./herdr-server-bootstrap";

const originalSkip = process.env.QUANTFLOW_SKIP_HERDR_BOOTSTRAP;

afterEach(() => {
  if (originalSkip === undefined) {
    delete process.env.QUANTFLOW_SKIP_HERDR_BOOTSTRAP;
  } else {
    process.env.QUANTFLOW_SKIP_HERDR_BOOTSTRAP = originalSkip;
  }
});

describe("herdr-server-bootstrap", () => {
  test("shouldSkipHerdrBootstrap respects env flag", () => {
    delete process.env.QUANTFLOW_SKIP_HERDR_BOOTSTRAP;
    expect(shouldSkipHerdrBootstrap()).toBe(false);
    process.env.QUANTFLOW_SKIP_HERDR_BOOTSTRAP = "1";
    expect(shouldSkipHerdrBootstrap()).toBe(true);
  });

  test("ensureHerdrServer skips when env flag is set", async () => {
    process.env.QUANTFLOW_SKIP_HERDR_BOOTSTRAP = "true";
    const result = await ensureHerdrServer();
    expect(result.state).toBe("skipped");
    expect(getHerdrBootstrapResult()?.state).toBe("skipped");
  });
});
