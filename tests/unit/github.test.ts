import test from "node:test";
import assert from "node:assert/strict";
import { githubRequest, isGithubConfigured } from "../../lib/github.ts";

test("github is env-configured without exposing a token", () => {
  const previous = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  assert.equal(isGithubConfigured(), false);
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_test_only";
  assert.equal(isGithubConfigured(), true);
  if (previous === undefined) delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  else process.env.GITHUB_PERSONAL_ACCESS_TOKEN = previous;
});

test("github_request rejects unsafe paths before any network call", async () => {
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_test_only";
  await assert.rejects(() => githubRequest({ path: "https://evil.example/repos" }), /path must be/);
  await assert.rejects(() => githubRequest({ path: "../etc/passwd" }), /path must be/);
  await assert.rejects(() => githubRequest({ method: "TRACE", path: "/user" }), /method must be/);
});
