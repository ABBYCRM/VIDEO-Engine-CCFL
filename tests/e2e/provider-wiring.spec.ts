import { expect, test, type Page, type Route } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=";
const plan = {mission:"Explain the selected campaign scenario clearly.",subject:"Professional spokesperson in a believable setting.",script:"Document the facts and explain the next practical step.",hook:"Know the next step",caption:"Practical information for the selected campaign.",visualDirection:"Single continuous social-video shot.",rationale:"Provider wiring acceptance fixture."};

async function stubCreate(page: Page) {
  await stubAuthenticatedSession(page);
  await page.route("**/api/admin/settings", (route: Route) => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({defaultProvider:"veo",providers:{veo:{keyConfigured:true},grok:{keyConfigured:true},a2e:{keyConfigured:true},hedra:{keyConfigured:true}}})}));
  await page.route("**/api/admin/avatars", (route: Route) => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({avatars:[{id:"female-anchor-01",name:"Female Anchor 01",referenceImage:"/identity.png",wardrobeRegenerationPrompt:null,views:{front:{status:"ready"}}}]})}));
  await page.route("**/api/admin/avatars/female-anchor-01/asset?view=front", (route: Route) => route.fulfill({status:200,contentType:"image/png",body:Buffer.from(ONE_PIXEL_PNG,"base64")}));
  await page.route("**/api/internal/campaign-plan", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({plan})}));
}

test("Create sends the exact selected provider for Veo, Grok and A2E and accepts queued jobs", async ({ page }) => {
  await stubCreate(page);const payloads:any[]=[];let seq=0;
  await page.route("**/api/internal/generate", async route => {payloads.push(await route.request().postDataJSON());seq+=1;await route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({job:{id:`queued-${seq}`,status:"queued"}})})});
  await page.route("**/api/v1/video/queued-*", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:route.request().url().split("/").pop(),status:"running"})}));
  await page.goto("/");
  const cases=[
    {card:"Google Veo 3.1 8s cinematic",generate:"Generate 8s with Google Veo 3.1",provider:"veo"},
    {card:"xAI Grok Imagine up to 15s",generate:"Generate 15s with xAI Grok Imagine",provider:"grok"},
    {card:"A2E AI router model dependent",generate:"Generate 8s with A2E AI router",provider:"a2e"}
  ] as const;
  for(const item of cases){await page.getByRole("button",{name:item.card,exact:true}).click();await page.getByRole("button",{name:item.generate,exact:true}).click();await expect.poll(()=>payloads.some(p=>p.provider===item.provider)).toBeTruthy()}
  expect(payloads.map(p=>p.provider)).toEqual(["veo","grok","a2e"]);await expect(page.getByText("This operation was aborted")).toHaveCount(0);
});

test("Hedra path sends canonical image, driving audio and selected duration", async ({ page }) => {
  await stubCreate(page);let payload:any=null;
  await page.route("**/api/internal/generate", async route => {payload=await route.request().postDataJSON();await route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({job:{id:"hedra-queued",status:"queued"}})})});
  await page.route("**/api/v1/video/hedra-queued", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:"hedra-queued",status:"running"})}));
  await page.goto("/");await page.getByRole("button",{name:"Hedra 15/30s avatar · audio driven",exact:true}).click();await page.getByLabel("Choose canonical avatar").selectOption("female-anchor-01");
  await page.locator('input[type="file"][accept*="audio"]').setInputFiles({name:"voice.wav",mimeType:"audio/wav",buffer:Buffer.from([82,73,70,70,1,2,3,4])});await page.getByLabel("Hedra duration").selectOption("30");await page.getByRole("button",{name:"Generate 30s with Hedra",exact:true}).click();
  await expect.poll(()=>payload?.provider).toBe("hedra");expect(payload.imageBase64).toBeTruthy();expect(payload.imageMimeType).toBe("image/png");expect(payload.audioBase64).toBeTruthy();expect(payload.audioMimeType).toBe("audio/wav");expect(payload.durationSeconds).toBe(30);await expect(page.getByText("This operation was aborted")).toHaveCount(0);
});

test("real generation route acknowledges every provider before provider startup completes", async ({ page }) => {
  await page.goto("/login");await page.getByPlaceholder("Admin password").fill(process.env.ADMIN_PASSWORD||"e2e-local-only");await page.getByRole("button",{name:"Sign in"}).click();await expect(page.getByRole("heading",{name:"Create"})).toBeVisible();
  for(const provider of ["veo","grok","a2e","hedra"] as const){const result=await page.evaluate(async({provider,png})=>{const started=Date.now();const r=await fetch("/api/internal/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({provider,category:"car_accident",mission:"Provider queue acceptance test",subject:"Professional spokesperson",script:"Test script",durationSeconds:provider==="hedra"?30:8,...(provider==="hedra"?{imageBase64:png,imageMimeType:"image/png",audioBase64:"UklGRg==",audioMimeType:"audio/wav"}:{})})});return{status:r.status,body:await r.json(),elapsed:Date.now()-started}},{provider,png:ONE_PIXEL_PNG});expect(result.status,`${provider} submission should be acknowledged`).toBe(202);expect(result.body.job.id).toBeTruthy();expect(["queued","starting","running","failed"]).toContain(result.body.job.status);expect(result.elapsed,`${provider} submission should not block on upstream generation`).toBeLessThan(5000)}
});
