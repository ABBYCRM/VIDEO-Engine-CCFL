import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const brain = join(root, "services/aion-brain");

describe("Aion-Brain absorbed into VIDEO", () => {
  it("ships the pinned Brain runtime in this repo", () => {
    assert.equal(existsSync(join(brain, "server.js")), true);
    assert.equal(existsSync(join(brain, "lib/cursor_cloud.js")), true);
    assert.equal(existsSync(join(brain, "Dockerfile")), true);
    const pkg = JSON.parse(readFileSync(join(brain, "package.json"), "utf8")) as { version?: string };
    assert.equal(pkg.version, "0.1.24");
    const source = readFileSync(join(brain, "SOURCE.md"), "utf8");
    assert.match(source, /cd554517671e776c82c29743825fbf8d9687d9fb/);
    assert.match(source, /aion-brain-6iptg\.ondigitalocean\.app/);
  });

  it("does not clone Aion-Brain from GitHub at image build time", () => {
    assert.equal(existsSync(join(root, "docker/aion.Dockerfile")), false);
    const compose = readFileSync(join(root, "docker-compose.aion.yml"), "utf8");
    assert.match(compose, /context: \.\/services\/aion-brain/);
    assert.doesNotMatch(compose, /github\.com\/ABBYCRM\/Aion-Brain/);
    const dockerfile = readFileSync(join(brain, "Dockerfile"), "utf8");
    assert.doesNotMatch(dockerfile, /git (clone|fetch|remote)/);
  });

  it("points the VIDEO DigitalOcean app at the in-app brain", () => {
    const spec = readFileSync(join(root, ".do/app.yaml"), "utf8");
    assert.match(spec, /name: aion-brain/);
    assert.match(spec, /source_dir: services\/aion-brain/);
    assert.match(spec, /\$\{aion-brain\.PRIVATE_URL\}/);
    assert.doesNotMatch(spec, /value: https:\/\/aion-brain-6iptg\.ondigitalocean\.app/);
    assert.doesNotMatch(spec, /ADMIN_PASSWORD/);
  });

  it("does not tell operators to destroy or archive the other system's brain", () => {
    const env = readFileSync(join(root, "docs/DIGITALOCEAN_ENV.md"), "utf8");
    const docs = readFileSync(join(root, "docs/aion-brain.md"), "utf8");
    const source = readFileSync(join(brain, "SOURCE.md"), "utf8");
    for (const text of [env, docs, source]) {
      assert.doesNotMatch(text, /Destroy standalone DigitalOcean app/);
      assert.doesNotMatch(text, /Archive later/);
      assert.match(text, /another system/i);
    }
  });

  it("BOS write still uses Brain content + source_id fields", () => {
    const client = readFileSync(join(root, "lib/claw/aion.ts"), "utf8");
    assert.match(client, /content: text/);
    assert.match(client, /source_id/);
    assert.match(client, /\/api\/claw\/execute/);
    assert.match(client, /\/api\/memory\/bos/);
    assert.match(client, /\/api\/routines/);
    assert.match(client, /\/api\/mcp\/status/);
    assert.match(client, /\/api\/agents\/spawn/);
    const server = readFileSync(join(brain, "server.js"), "utf8");
    assert.match(server, /\/api\/claw\/execute/);
    assert.match(server, /\/api\/memory\/bos/);
  });
});
