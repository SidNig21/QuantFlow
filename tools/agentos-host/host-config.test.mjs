import assert from "node:assert/strict";
import test from "node:test";

process.env.AGENTOS_HOST_NO_LISTEN = "1";

const {
  SessionConfigError,
  resolveQuantflowEvePackagePath,
  resolveSessionConfig,
} = await import("./host.js");

const CREDENTIAL_KEYS = [
  "OPENCODE_API_KEY",
  "OPENCODE_GO_API_KEY",
  "OPENCODE_ZEN_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
];

function withEnv(values, fn) {
  const snapshot = new Map();
  for (const key of new Set([...CREDENTIAL_KEYS, ...Object.keys(values)])) {
    snapshot.set(key, process.env[key]);
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of snapshot) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("resolves Eve software with OPENCODE_GO_API_KEY in session env", () => {
  withEnv({ OPENCODE_GO_API_KEY: "test-eve-key" }, () => {
    assert.deepEqual(resolveSessionConfig("eve"), {
      software: "eve",
      env: {
        OPENCODE_API_KEY: "test-eve-key",
        OPENCODE_GO_API_KEY: "test-eve-key",
        OPENCODE_ZEN_API_KEY: "test-eve-key",
      },
      opencodeKey: "test-eve-key",
    });
  });
});

test("resolves Eve software when only OPENCODE_API_KEY is set (WSL profile alias)", () => {
  withEnv(
    {
      OPENCODE_API_KEY: "profile-alias-key",
      OPENCODE_GO_API_KEY: undefined,
      OPENCODE_ZEN_API_KEY: undefined,
    },
    () => {
      assert.deepEqual(resolveSessionConfig("eve"), {
        software: "eve",
        env: {
          OPENCODE_API_KEY: "profile-alias-key",
          OPENCODE_GO_API_KEY: "profile-alias-key",
          OPENCODE_ZEN_API_KEY: "profile-alias-key",
        },
        opencodeKey: "profile-alias-key",
      });
    },
  );
});

test("rejects Eve software when all OpenCode aliases are missing", () => {
  withEnv(
    {
      OPENCODE_API_KEY: undefined,
      OPENCODE_GO_API_KEY: undefined,
      OPENCODE_ZEN_API_KEY: undefined,
    },
    () => {
      assert.throws(
        () => resolveSessionConfig("eve"),
        (error) => error instanceof SessionConfigError
          && /OPENCODE_API_KEY/.test(error.message),
      );
    },
  );
});

test("keeps unknown software rejection explicit", () => {
  withEnv({}, () => {
    assert.throws(
      () => resolveSessionConfig("does-not-exist"),
      (error) => error instanceof SessionConfigError
        && /unknown software 'does-not-exist'/.test(error.message),
    );
  });
});

test("supports env override for Eve package path", () => {
  withEnv({ QUANTFLOW_EVE_AGENTOS_PKG: "/tmp/eve/package.aospkg" }, () => {
    assert.equal(resolveQuantflowEvePackagePath(), "/tmp/eve/package.aospkg");
  });
});
