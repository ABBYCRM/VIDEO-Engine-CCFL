import { expect, test, type Page, type Route } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=";

async function stubBase(page:Page) {
  await stubAuthenticatedSession(page);
  await page.route("**/api/admin/settings", (route:Route) => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({defaultProvider:"veo",providers:{veo:{keyConfigured:true},grok:{keyConfigured:true},a2e:{keyConfigured:true},hedra:{keyConfigured:true}}})}));
  await page.route("**/api/admin/avatars", (route:Route) => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({avatars:[{id:"female-anchor-01",name:"Female Anchor 01",referenceImage:"/avatars/female-anchor-01/identity.png",views:{front:{status:"ready"}}}]})}));
  await page.route("**/api/admin/avatars/female-anchor-01/asset?view=front", (route:Route) => route.fulfill({status:200,contentType:"image/png",body:Buffer.from(ONE_PIXEL_PNG,"base64")}));
}

test("create keeps all video engines selectable and Hedra exposes long-form inputs",async({page})=>{
  await stubBase(page);await page.goto("/");await expect(page.getByRole("heading",{name:"Create campaign content"})).toBeVisible();
  const cards=[/^Google Veo 3\.1 8s cinematic/i,/^xAI Grok Imagine up to 15s/i,/^A2E AI router model dependent/i,/^Hedra 15\/30s avatar/i];
  for(const name of cards)await expect(page.getByRole("button",{name})).toBeVisible();
  await page.getByRole("button",{name:/^Hedra 15\/30s avatar/i}).click();await expect(page.getByLabel("Hedra duration")).toHaveValue("30");await expect(page.getByText("Driving audio (required)")).toBeVisible();await expect(page.getByRole("button",{name:"Generate 30s with Hedra"})).toBeDisabled();
});

test("create can load a canonical avatar instead of a one-off reference",async({page})=>{await stubBase(page);await page.goto("/");await page.getByLabel("Choose canonical avatar").selectOption("female-anchor-01");await expect(page.getByText("Loaded canonical image for Female Anchor 01.")).toBeVisible();await expect(page.getByText(/Using: female-anchor-01-front\.png/)).toBeVisible();await expect(page.getByLabel("Subject / spokesperson direction")).toHaveValue(/Female Anchor 01/);});

test("successful campaign generation can enter approval queue or publish to Instagram",async({page})=>{
  await stubBase(page);let calendarPayload:any=null,instagramPayload:any=null;
  await page.route("**/api/internal/generate",(route:Route)=>route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({job:{id:"job-create",status:"running"}})}));
  await page.route("**/api/v1/video/job-create",(route:Route)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:"job-create",status:"succeeded",fileUrl:"/api/v1/video/job-create/file"})}));
  await page.route("**/api/v1/video/job-create/file",(route:Route)=>route.fulfill({status:200,contentType:"video/mp4",body:""}));
  await page.route("**/api/calendar",async(route:Route)=>{if(route.request().method()!=="POST")return route.continue();calendarPayload=await route.request().postDataJSON();return route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({post:{id:"scheduled-create",...calendarPayload}})});});
  await page.route("**/api/publish/instagram",async(route:Route)=>{instagramPayload=await route.request().postDataJSON();return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,mediaId:"ig-1"})});});
  await page.goto("/");await page.getByLabel("Mission").fill("Explain why scene documentation matters.");await page.getByRole("button",{name:"Generate 8s with Google Veo 3.1"}).click();await expect.poll(async()=>page.getByRole("button",{name:"Send to approval Calendar"}).count(),{timeout:10000}).toBe(1);await page.getByRole("button",{name:"Send to approval Calendar"}).click();await expect(page.getByRole("button",{name:"Added to Calendar"})).toBeVisible();expect(calendarPayload.status).toBe("pending");expect(calendarPayload.autoPost).toBe(false);expect(calendarPayload.videoJobId).toBe("job-create");page.on("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Post to Instagram now"}).click();await expect(page.getByRole("button",{name:"Posted to Instagram"})).toBeVisible();expect(instagramPayload.jobId).toBe("job-create");
});
