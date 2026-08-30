import { expect, test, type Page } from "@playwright/test";

// Waits for the shared app shell's "Sign out" control (present on every
// authenticated page) rather than a specific page's heading, since a real
// login's post-login landing page has changed before (Calendar -> Claw)
// and this helper's callers only need an authenticated session, never the
// Calendar page itself.
async function realLogin(page:Page){await page.goto("/login");await page.getByPlaceholder("Admin password").fill(process.env.ADMIN_PASSWORD||"e2e-local-only");await page.getByRole("button",{name:"Sign in"}).click();await expect(page.getByRole("button",{name:"Sign out"})).toBeVisible({timeout:15000})}
async function sameOriginJson(page:Page,url:string){return page.evaluate(async url=>{const r=await fetch(url,{cache:"no-store"});return{status:r.status,body:await r.json()}},url)}

test("real split-screen composition endpoint persists final media into Library and Calendar",async({page})=>{
  await realLogin(page);const suffix=Date.now(),title=`E2E Split ${suffix}`;
  const response=await page.evaluate(async({title})=>{const form=new FormData();form.append("file",new File([new Uint8Array([26,69,223,163,1,2,3,4])],"composition.webm",{type:"video/webm"}));form.append("title",title);form.append("caption","Rendered two-lane acceptance composition");form.append("upperSource","upper-job-e2e");form.append("lowerSource","lower-job-e2e");form.append("splitPercent","35");const r=await fetch("/api/internal/compositions",{method:"POST",body:form});return{status:r.status,body:await r.json()}},{title});
  expect(response.status).toBe(201);expect(response.body.url).toMatch(/^\/generated\/compositions\/.+\.webm$/);
  const libraryResponse=await sameOriginJson(page,"/api/library");expect(libraryResponse.status).toBe(200);const asset=libraryResponse.body.assets.find((a:any)=>a.title===title);expect(asset).toBeTruthy();expect(asset.kind).toBe("composition");expect(asset.mediaType).toBe("video");expect(asset.label).toContain("35% top");
  const calendarResponse=await sameOriginJson(page,"/api/calendar");expect(calendarResponse.status).toBe(200);const post=calendarResponse.body.posts.find((p:any)=>p.title===title);expect(post).toBeTruthy();expect(post.contentType).toBe("podcast");expect(post.mediaUrl).toBe(response.body.url);expect(post.videoJobId).toBeFalsy();
});
