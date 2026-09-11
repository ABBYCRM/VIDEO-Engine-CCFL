import type { Browser, BrowserContext } from "playwright";

export const COMPUTER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.137 Safari/537.36";

/** Modest Google-compat layer. Not a claim of undetectability. */
export const COMPUTER_COMPAT_SCRIPT = `(() => {
  try {
    Object.defineProperty(navigator, "webdriver", { get: function () { return undefined; }, configurable: true });
  } catch (e) {}
  try {
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || { connect: function () {}, sendMessage: function () {} };
  } catch (e) {}
})();`;

export const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-blink-features=AutomationControlled",
  "--disable-infobars",
];

export type LaunchedComputer = {
  context: BrowserContext;
  browser?: Browser;
  via: "chrome" | "chromium";
};

export async function launchComputerContext(
  profileDir: string,
  viewport: { width: number; height: number },
): Promise<LaunchedComputer> {
  const { chromium } = await import("playwright");
  const common = {
    headless: true as const,
    viewport,
    acceptDownloads: true,
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light" as const,
    userAgent: COMPUTER_UA,
    ignoreDefaultArgs: ["--enable-automation"],
    args: CHROME_ARGS,
  };

  try {
    const context = await chromium.launchPersistentContext(profileDir, { ...common, channel: "chrome" });
    await context.addInitScript(COMPUTER_COMPAT_SCRIPT);
    return { context, via: "chrome" };
  } catch {
    try {
      const context = await chromium.launchPersistentContext(profileDir, common);
      await context.addInitScript(COMPUTER_COMPAT_SCRIPT);
      return { context, via: "chromium" };
    } catch {
      const browser = await chromium.launch({
        headless: true,
        args: CHROME_ARGS,
        ignoreDefaultArgs: ["--enable-automation"],
      });
      const context = await browser.newContext({
        viewport,
        acceptDownloads: true,
        locale: "en-US",
        timezoneId: "America/New_York",
        userAgent: COMPUTER_UA,
      });
      await context.addInitScript(COMPUTER_COMPAT_SCRIPT);
      return { context, browser, via: "chromium" };
    }
  }
}
