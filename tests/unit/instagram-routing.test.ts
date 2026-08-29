import assert from "node:assert/strict";
import test from "node:test";
import { getInstagramDmCapability } from "../../lib/claw/instagram-dm-capability.ts";
import {
  getComposioMediaInsightsArgs,
  INSTAGRAM_MEDIA_INSIGHT_METRICS
} from "../../lib/instagram-composio-args.ts";

test("Composio makes DMs available even when the direct Graph toggle is off", () => {
  const capability = getInstagramDmCapability({
    composioReady: true,
    graphReady: false,
    graphDmEnabled: false
  });

  assert.equal(capability.available, true);
  assert.equal(capability.primary, "composio");
  assert.deepEqual(capability.providers, { composio: true, graph: false });
  assert.match(capability.policy, /existing conversation.*24-hour/i);
});

test("direct Graph is a DM fallback only when live and explicitly enabled", () => {
  const disabled = getInstagramDmCapability({
    composioReady: false,
    graphReady: true,
    graphDmEnabled: false
  });
  assert.equal(disabled.available, false);
  assert.equal(disabled.primary, null);

  const enabled = getInstagramDmCapability({
    composioReady: false,
    graphReady: true,
    graphDmEnabled: true
  });
  assert.equal(enabled.available, true);
  assert.equal(enabled.primary, "instagram-mcp");
  assert.deepEqual(enabled.providers, { composio: false, graph: true });
});

test("Composio media insights uses the current action argument shape", () => {
  assert.deepEqual(getComposioMediaInsightsArgs(" 1789001 "), {
    ig_media_id: "1789001",
    metric: [...INSTAGRAM_MEDIA_INSIGHT_METRICS]
  });
  assert.deepEqual(INSTAGRAM_MEDIA_INSIGHT_METRICS, [
    "views",
    "reach",
    "likes",
    "comments",
    "saved",
    "shares"
  ]);
  assert.throws(() => getComposioMediaInsightsArgs(""), /mediaId is required/);
});
