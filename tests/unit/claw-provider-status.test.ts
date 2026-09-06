import test from "node:test";
import assert from "node:assert/strict";
import { classifyComposioKey } from "../../lib/composio/consumer.ts";
import { isGithubConfigured } from "../../lib/github.ts";
import { isHedraConfigured, hedraStatus } from "../../lib/hedra.ts";
import { isResendConfigured } from "../../lib/resend.ts";
import { isE2BConfigured } from "../../lib/e2b-sandbox.ts";

test("provider flags never include secret values", () => {
  const previous = {
    github: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    hedra: process.env.HEDRA_API_KEY,
    resend: process.env.RESEND_API_KEY,
    e2b: process.env.E2B_API_KEY,
    composio: process.env.COMPOSIO_API_KEY
  };
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_super_secret";
  process.env.HEDRA_API_KEY = "hedra_super_secret";
  process.env.RESEND_API_KEY = "re_super_secret";
  process.env.E2B_API_KEY = "e2b_super_secret";
  process.env.COMPOSIO_API_KEY = "oak_super_secret";

  const snapshot = JSON.stringify({
    github: isGithubConfigured(),
    hedra: hedraStatus(),
    resend: isResendConfigured(),
    e2b: isE2BConfigured(),
    composioKeyType: classifyComposioKey(process.env.COMPOSIO_API_KEY)
  });
  assert.equal(classifyComposioKey(process.env.COMPOSIO_API_KEY), "org");
  assert.doesNotMatch(snapshot, /super_secret/);
  assert.doesNotMatch(snapshot, /ghp_/);
  assert.doesNotMatch(snapshot, /re_/);
  assert.doesNotMatch(snapshot, /oak_super/);

  for (const [key, value] of Object.entries({
    GITHUB_PERSONAL_ACCESS_TOKEN: previous.github,
    HEDRA_API_KEY: previous.hedra,
    RESEND_API_KEY: previous.resend,
    E2B_API_KEY: previous.e2b,
    COMPOSIO_API_KEY: previous.composio
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
