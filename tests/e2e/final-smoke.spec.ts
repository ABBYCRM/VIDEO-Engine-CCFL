import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

function parseRgb(value: string) {
  const parts = value.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return parts.slice(0, 3) as [number, number, number];
}

function luminance([r,g,b]: [number,number,number]) {
  const channel = (v:number) => {
    const s=v/255;
    return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);
  };
  return 0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);
}

function contrast(fg:[number,number,number],bg:[number,number,number]) {
  const a=luminance(fg),b=luminance(bg),lighter=Math.max(a,b),darker=Math.min(a,b);
  return (lighter+0.05)/(darker+0.05);
}

test("final workflow surfaces are present", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create campaign content" })).toBeVisible();
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Content Calendar" })).toBeVisible();
});

test("shared action buttons remain readable on light surfaces", async ({ page }) => {
  await stubAuthenticatedSession(page);
  for (const path of ["/", "/sites", "/library", "/calendar", "/avatars", "/campaigns"]) {
    await page.goto(path);
    const buttons=page.locator("button:not([disabled])");
    const count=await buttons.count();
    for(let i=0;i<count;i++){
      const button=buttons.nth(i);
      if(!(await button.isVisible())) continue;
      const text=(await button.innerText()).trim();
      if(!text) continue;
      const styles=await button.evaluate(el=>{
        const s=getComputedStyle(el);
        return {color:s.color,background:s.backgroundColor};
      });
      if(styles.background==="rgba(0, 0, 0, 0)"||styles.background==="transparent") continue;
      const ratio=contrast(parseRgb(styles.color),parseRgb(styles.background));
      expect(ratio,`${path}: button “${text}” contrast ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
