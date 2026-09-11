import { createHash } from "node:crypto";
import type { BrowserFingerprint } from "./types";

/** Runs inside the page. Must stay closure-free for Playwright evaluate. */
export async function collectFingerprintInPage(): Promise<BrowserFingerprint> {
  function getWebGL(): BrowserFingerprint["webgl"] {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    return {
      vendor: String(gl.getParameter(gl.VENDOR)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      unmaskedVendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
      unmaskedRenderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || null,
      extensions: (gl.getSupportedExtensions() || []).slice().sort(),
    };
  }

  async function getCanvasDigest(): Promise<string | null> {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.font = "18px Arial";
    ctx.fillText("claw-forge-fingerprint-lab", 10, 30);
    ctx.fillRect(17, 45, 113, 7);
    const bytes = new TextEncoder().encode(canvas.toDataURL());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const nav = navigator as Navigator & { deviceMemory?: number; webdriver?: boolean };
  const audio =
    typeof AudioContext !== "undefined"
      ? { available: true, sampleRate: new AudioContext().sampleRate }
      : { available: false as const };

  return {
    userAgent: navigator.userAgent,
    webdriver: nav.webdriver,
    platform: navigator.platform,
    vendor: navigator.vendor,
    languages: [...(navigator.languages || [])],
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    cookieEnabled: navigator.cookieEnabled,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
    },
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    capabilities: {
      webRTC: typeof RTCPeerConnection !== "undefined",
      worker: typeof Worker !== "undefined",
      serviceWorker: "serviceWorker" in navigator,
      touchEvent: "ontouchstart" in window,
    },
    fonts: {
      arial: document.fonts ? document.fonts.check("16px Arial") : null,
      times: document.fonts ? document.fonts.check("16px 'Times New Roman'") : null,
      courier: document.fonts ? document.fonts.check("16px 'Courier New'") : null,
    },
    webgl: getWebGL(),
    canvasSha256: await getCanvasDigest(),
    audio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function fingerprintDigest(fp: BrowserFingerprint): string {
  return createHash("sha256").update(JSON.stringify(fp)).digest("hex");
}
