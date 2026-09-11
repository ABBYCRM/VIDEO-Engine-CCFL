import type { StealthMode } from "./types";

/**
 * Honest stealth contract. This is not puppeteer-extra and not Steel Cloud.
 * Coherence only deletes ChromeDriver leftover globals.
 * Lab pins two navigator hardware fields and copies them into Worker scopes
 * so a defender comparing main world vs Worker does not see a split identity
 * that we ourselves created. webdriver, canvas, audio, WebRTC stay real.
 */
export const STEALTH_CONTRACT = {
  removesCdcGlobals: true,
  rewritesWebdriver: false,
  spoofsCanvas: false,
  spoofsAudio: false,
  spoofsWebRTC: false,
  spoofsFonts: false,
  farmsCaptcha: false,
  rotatesResidentialProxies: false,
  workerCoherenceWhenLab: true,
  labHardwareConcurrency: 8,
  labDeviceMemory: 8,
} as const;

const CDC_WIPE = `
  try {
    var wipe = function (root) {
      var names = Object.getOwnPropertyNames(root);
      for (var i = 0; i < names.length; i++) {
        var key = names[i];
        if (key.indexOf("cdc_") === 0) {
          try { delete root[key]; } catch (e) {}
        }
      }
    };
    wipe(window);
    wipe(document);
  } catch (e) {}
`;

export function coherenceInitScript(): string {
  return `(() => {${CDC_WIPE}})();`;
}

export function labProfileInitScript(): string {
  const hc = STEALTH_CONTRACT.labHardwareConcurrency;
  const dm = STEALTH_CONTRACT.labDeviceMemory;
  return `(() => {
${CDC_WIPE}
  try {
    var HC = ${hc};
    var DM = ${dm};
    var patch = function (nav) {
      try {
        Object.defineProperty(nav, "hardwareConcurrency", {
          get: function () { return HC; },
          enumerable: true,
          configurable: true
        });
      } catch (e) {}
      try {
        Object.defineProperty(nav, "deviceMemory", {
          get: function () { return DM; },
          enumerable: true,
          configurable: true
        });
      } catch (e) {}
    };
    patch(navigator);
    var NativeWorker = window.Worker;
    if (typeof NativeWorker === "function") {
      var Wrapped = function (url, opts) {
        var prelude = "Object.defineProperty(self.navigator,'hardwareConcurrency',{get:function(){return " + HC + ";}});Object.defineProperty(self.navigator,'deviceMemory',{get:function(){return " + DM + ";}});";
        if (typeof url === "string") {
          var blob = new Blob([prelude + "\\nimportScripts(" + JSON.stringify(url) + ");"], { type: "text/javascript" });
          return new NativeWorker(URL.createObjectURL(blob), opts);
        }
        return new NativeWorker(url, opts);
      };
      Wrapped.prototype = NativeWorker.prototype;
      window.Worker = Wrapped;
    }
  } catch (e) {}
})();`;
}

export function initScriptFor(mode: StealthMode): string | null {
  if (mode === "coherence") return coherenceInitScript();
  if (mode === "lab") return labProfileInitScript();
  return null;
}

export function describeStealth(mode: StealthMode): string {
  if (mode === "off") return "No init script. Chromium identity is unmodified.";
  if (mode === "lab") {
    return `Lab profile: CPU=${STEALTH_CONTRACT.labHardwareConcurrency} RAM=${STEALTH_CONTRACT.labDeviceMemory}GB, Worker-copied. webdriver stays real.`;
  }
  return "Coherence: ChromeDriver cdc_ globals stripped. No spoofed navigator, canvas, or GPU.";
}
