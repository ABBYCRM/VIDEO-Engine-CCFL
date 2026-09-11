import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapContainedClick, pointerOffset } from "../../lib/browser-computer/screen-map.ts";

describe("screen click mapping", () => {
  it("maps identity when the image box is 1280x800", () => {
    const hit = mapContainedClick({
      clientX: 640,
      clientY: 400,
      rect: { left: 0, top: 0, width: 1280, height: 800 },
    });
    assert.deepEqual(hit, { x: 640, y: 400 });
  });

  it("ignores letterbox below a portrait phone and hits the duck tile", () => {
    // Phone: 1080 x 1600 img element, object-contain object-top of 1280x800
    const rect = { left: 0, top: 0, width: 1080, height: 1600 };
    const scale = 1080 / 1280;
    // Duck tile roughly at viewport (960, 560)
    const clientX = 960 * scale;
    const clientY = 560 * scale;
    const hit = mapContainedClick({ clientX, clientY, rect });
    assert.ok(hit);
    assert.ok(Math.abs(hit!.x - 960) <= 2);
    assert.ok(Math.abs(hit!.y - 560) <= 2);
  });

  it("returns null for taps in the black letterbox", () => {
    const rect = { left: 0, top: 0, width: 1080, height: 1600 };
    const miss = mapContainedClick({ clientX: 540, clientY: 1400, rect });
    assert.equal(miss, null);
  });

  it("places the pointer overlay on the rendered bitmap, not the letterbox", () => {
    const pin = pointerOffset(960, 560, { width: 1080, height: 1600 });
    const scale = 1080 / 1280;
    assert.ok(Math.abs(pin.left - 960 * scale) < 1);
    assert.ok(Math.abs(pin.top - 560 * scale) < 1);
  });
});
