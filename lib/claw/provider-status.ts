// Secret-free Claw provider / tool rollup for /api/health and claw-state.
import { CLAW_TOOLS } from "@/lib/claw/tools";
import { RUNTIME_TOOL_DEFS } from "@/lib/claw/openai-tools";
import { getClawModel, hasNvidiaApiKeys, isNvidiaEnabled } from "@/lib/nvidia/client";
import { classifyComposioKey } from "@/lib/composio/consumer";
import { isComposioConfigured, getComposioApiKey } from "@/lib/composio/client";
import { isSteelConfigured } from "@/lib/steel";
import { isScreenshotOneConfigured } from "@/lib/screenshotone";
import { isExaConfigured, isTavilyConfigured } from "@/lib/web-search";
import { isFirecrawlConfigured, isScrapingBeeConfigured, isScrapflyConfigured } from "@/lib/scrape";
import { isGithubConfigured } from "@/lib/github";
import { isE2BConfigured } from "@/lib/e2b-sandbox";
import { isHedraConfigured } from "@/lib/hedra";
import { isResendConfigured } from "@/lib/resend";
import { isHeliconeEnabled } from "@/lib/nvidia/helicone";
import { isClawEnabled } from "@/lib/feature-flags";

function envSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function composioStatus() {
  const configured = isComposioConfigured();
  if (!configured) return { configured: false, keyType: "none" as const, note: "COMPOSIO_API_KEY is not set." };
  try {
    const keyType = classifyComposioKey(getComposioApiKey());
    if (keyType === "org") {
      return {
        configured: true,
        keyType,
        usable: false,
        note: "COMPOSIO_API_KEY looks like an org/OAuth key (oak_…). Claw needs a project key (ak_…) or Connect consumer key (ck_…)."
      };
    }
    return { configured: true, keyType, usable: true };
  } catch {
    return { configured: true, keyType: "unknown" as const, usable: false };
  }
}

export function clawProviderStatus() {
  const composio = composioStatus();
  return {
    claw: isClawEnabled() ? "enabled" : "disabled",
    flag: "CLAW_ENABLED",
    current: String(process.env.CLAW_ENABLED ?? "true"),
    nvidia: {
      configured: hasNvidiaApiKeys(),
      enabled: (() => { try { return isNvidiaEnabled(); } catch { return false; } })(),
      model: hasNvidiaApiKeys() ? getClawModel() : null,
      envOverride: Boolean(process.env.CLAW_NVIDIA_MODEL?.trim())
    },
    tools: {
      registered: CLAW_TOOLS.map((t) => t.name),
      runtime: RUNTIME_TOOL_DEFS.map((t) => t.name),
      count: CLAW_TOOLS.length + RUNTIME_TOOL_DEFS.length
    },
    providers: {
      steel: { configured: isSteelConfigured() },
      firecrawl: { configured: isFirecrawlConfigured() },
      scrapingbee: { configured: isScrapingBeeConfigured() },
      scrapfly: { configured: isScrapflyConfigured() },
      screenshotone: { configured: isScreenshotOneConfigured(), signed: envSet("SCREENSHOTONE_SECRET_KEY") },
      exa: { configured: isExaConfigured() },
      tavily: { configured: isTavilyConfigured() },
      composio,
      e2b: { configured: isE2BConfigured() },
      hedra: { configured: isHedraConfigured() },
      github: { configured: isGithubConfigured() },
      resend: { configured: isResendConfigured() },
      helicone: { configured: envSet("HELICONE_API_KEY"), enabled: isHeliconeEnabled() },
      aion: { configured: envSet("AION_BASE_URL") && envSet("AION_API_KEY") }
    }
  };
}
