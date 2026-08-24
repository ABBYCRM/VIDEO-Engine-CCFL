import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const ONE_PIXEL_PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=";
const splitPlan={hook:"LIVE UPDATE",caption:"A quick field update on what to document after a collision.",relationshipSummary:"Studio anchor asks; field reporter answers.",upper:{mission:"Ask what matters immediately after a collision.",subject:"TV studio anchor at news desk.",script:"What should drivers document before leaving the scene?",visualDirection:"One continuous studio shot."},lower:{mission:"Answer with practical documentation guidance.",subject:"Professional field reporter beside a safe roadside location.",script:"If it is safe, photograph the vehicles, roadway, visible damage, and identifying information before details disappear.",visualDirection:"Stable field-report shot."}};

test("split-screen supports AI upper plus canonical Hedra lower and requires final composition render",async({page})=>{
  await stubAuthenticatedSession(page);const generateCalls:any[]=[];
  await page.route("**/api/admin/avatars",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({avatars:[{id:"female-anchor-01",name:"Female Anchor 01",referenceImage:"x",wardrobeRegenerationPrompt:null,views:{front:{status:"ready"}}}]})}));
  await page.route("**/api/admin/avatars/female-anchor-01/asset?view=front",route=>route.fulfill({status:200,contentType:"image/png",body:Buffer.from(ONE_PIXEL_PNG,"base64")}));
  await page.route("**/api/internal/split-plan",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({plan:splitPlan})}));
  await page.route("**/api/internal/generate",async route=>{const body=await route.request().postDataJSON();generateCalls.push(body);const id=generateCalls.length===1?"top-job":"bottom-job";return route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({job:{id,status:"running"}})})});
  await page.route("**/api/v1/video/top-job",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:"top-job",status:"succeeded",fileUrl:"/api/v1/video/top-job/file"})}));
  await page.route("**/api/v1/video/bottom-job",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:"bottom-job",status:"succeeded",fileUrl:"/api/v1/video/bottom-job/file"})}));
  await page.route("**/api/v1/video/*/file",route=>route.fulfill({status:200,contentType:"video/mp4",body:""}));
  await page.goto("/podcast-interview");await expect(page.getByRole("heading",{name:"Two-lane campaign production"})).toBeVisible();await page.getByRole("button",{name:"AI generate"}).click();await page.getByLabel("Campaign subject").selectOption("car_accident");await page.getByLabel("Split relationship").selectOption("anchor_field");await page.getByLabel("Upper AI engine").selectOption("veo");await page.getByLabel("Canonical lower avatar").selectOption("female-anchor-01");await page.getByRole("button",{name:"Plan both lanes with AI"}).click();await expect(page.getByText("What should drivers document before leaving the scene?")).toBeVisible();await expect(page.getByText(/If it is safe, photograph/)).toBeVisible();
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({name:"voice.mp3",mimeType:"audio/mpeg",buffer:Buffer.from("fake-audio")});await page.getByRole("button",{name:"Generate both lanes"}).click();await expect.poll(()=>generateCalls.length).toBe(2);expect(generateCalls[0].provider).toBe("veo");expect(generateCalls[1].provider).toBe("hedra");expect(generateCalls[1].durationSeconds).toBe(30);expect(generateCalls[1].audioBase64).toBeTruthy();
  await expect.poll(async()=>page.locator('video[src*="bottom-job"]').count(),{timeout:10000}).toBe(1);await expect(page.locator('video[src*="top-job"]')).toBeVisible();await expect(page.getByRole("button",{name:"Render final split-screen"})).toBeVisible();await expect(page.getByRole("button",{name:"Send split-screen to Calendar"})).toHaveCount(0);await expect(page.getByText("Live 9:16 composition")).toBeVisible();
});

test("split-screen still supports uploaded upper video and adjustable ratio",async({page})=>{await stubAuthenticatedSession(page);await page.route("**/api/admin/avatars",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({avatars:[]})}));await page.goto("/podcast-interview");await page.locator('input[type="file"][accept="video/*"]').first().setInputFiles({name:"context.mp4",mimeType:"video/mp4",buffer:Buffer.from("fake-video")});await expect(page.locator("video").first()).toBeVisible();await page.locator('input[type="range"]').fill("40");await expect(page.getByText("Top 40% · Bottom 60%" )).toBeVisible();});

test("Calendar save uses the male avatar and uploads rotating top videos",async({page})=>{
  await stubAuthenticatedSession(page);
  const uploads:string[]=[];
  let campaignPayload:any=null;
  await page.route("**/api/admin/avatars",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({avatars:[
    {id:"female-anchor-01",name:"Female Anchor 01",gender:"female",referenceImage:"x",wardrobeRegenerationPrompt:null,views:{front:{status:"ready"}}},
    {id:"male-attorney-01",name:"Male Attorney 01",gender:"male",referenceImage:"x",wardrobeRegenerationPrompt:null,views:{front:{status:"ready"}}}
  ]})}));
  await page.route("**/api/admin/avatars/male-attorney-01/asset?view=front",route=>route.fulfill({status:200,contentType:"image/png",body:Buffer.from(ONE_PIXEL_PNG,"base64")}));
  await page.route("**/api/admin/avatars/female-anchor-01/asset?view=front",route=>route.fulfill({status:200,contentType:"image/png",body:Buffer.from(ONE_PIXEL_PNG,"base64")}));
  await page.route("**/api/internal/split-plan",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({plan:splitPlan})}));
  await page.route("**/api/campaigns",async route=>{campaignPayload=await route.request().postDataJSON();return route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({campaign:{id:"camp-1"},calendarCount:7})})});
  await page.route("**/api/campaigns/camp-1/upper-videos",async route=>{
    const body=route.request().postDataBuffer();
    uploads.push(String(body?.length||0));
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,upperVideoIds:["upper:1","upper:2"]})});
  });
  await page.goto("/podcast-interview");
  await expect(page.getByLabel("Canonical lower avatar")).toHaveValue("male-attorney-01");
  await page.locator('input[type="file"][accept="video/*"][multiple]').setInputFiles([
    {name:"highway.mp4",mimeType:"video/mp4",buffer:Buffer.from("highway")},
    {name:"night-crash.mp4",mimeType:"video/mp4",buffer:Buffer.from("night")}
  ]);
  await page.getByRole("button",{name:"Plan both lanes with AI"}).click();
  await page.getByRole("button",{name:"Save + fill Calendar"}).click();
  await expect(page.getByText(/7 Calendar slots created/)).toBeVisible();
  expect(campaignPayload.avatarId).toBe("male-attorney-01");
  expect(campaignPayload.contentType).toBe("podcast");
  expect(uploads.length).toBe(1);
});

