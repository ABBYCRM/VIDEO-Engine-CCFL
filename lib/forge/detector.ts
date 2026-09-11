import type { BrowserFingerprint, DetectorFinding, DetectorResult } from "./types";

/**
 * Educational anomaly scorer for a browser you control.
 * Transparent heuristics, not a production anti-bot model.
 * A single webdriver:false is never treated as "human".
 */
export function inspectBrowser(fp: BrowserFingerprint): DetectorResult {
  const findings: DetectorFinding[] = [];

  if (fp.webdriver === true) {
    findings.push({
      signal: "webdriver",
      weight: 2,
      explanation: "navigator.webdriver is true. W3C requires this while the user agent is under remote control.",
    });
  }

  if (!fp.languages.length) {
    findings.push({
      signal: "languages",
      weight: 1,
      explanation: "No browser language list was exposed.",
    });
  }

  if (
    typeof fp.screen.width === "number" &&
    typeof fp.window.outerWidth === "number" &&
    fp.window.outerWidth > fp.screen.width
  ) {
    findings.push({
      signal: "geometry",
      weight: 2,
      explanation: "Outer browser width exceeds reported screen width.",
    });
  }

  const hc = fp.hardwareConcurrency;
  if (typeof hc === "number" && (hc <= 0 || hc > 256)) {
    findings.push({
      signal: "hardwareConcurrency",
      weight: 2,
      explanation: "Reported CPU count is implausible.",
    });
  }

  if (!fp.webgl) {
    findings.push({
      signal: "webgl",
      weight: 1,
      explanation: "WebGL is unavailable. That can be legitimate, but it is unusual on a desktop Chrome.",
    });
  }

  if (String(fp.userAgent).includes("HeadlessChrome")) {
    findings.push({
      signal: "userAgent",
      weight: 2,
      explanation: "User-Agent contains HeadlessChrome.",
    });
  }

  const ua = String(fp.userAgent);
  if (/Linux/i.test(ua) && fp.platform && !/Linux/i.test(fp.platform) && fp.platform !== "Linux x86_64") {
    findings.push({
      signal: "ua-platform",
      weight: 2,
      explanation: "User-Agent OS does not match navigator.platform.",
    });
  }

  if (fp.capabilities.touchEvent && fp.maxTouchPoints === 0) {
    findings.push({
      signal: "touch",
      weight: 1,
      explanation: "Touch events exist but maxTouchPoints is 0.",
    });
  }

  const score = findings.reduce((sum, item) => sum + item.weight, 0);
  return {
    score,
    findings,
    note: "Score is a lab heuristic, not a CAPTCHA bypass certificate. Cross-attribute consistency beats hiding one flag.",
  };
}
