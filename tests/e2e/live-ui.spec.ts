import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const BASE_APIS = async (page: import("@playwright/test").Page) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/admin/settings", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ defaultProvider:"veo", providers:{ veo:{keyConfigured:true}, grok:{keyConfigured:true}, a2e:{keyConfigured:true}, hedra:{keyConfigured:true} } }) }));
  await page.route("**/api/admin/avatars", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ avatars:[{ id:"female-anchor-01", name:"Female Anchor 01", referenceImage:"/avatars/female-anchor-01/identity.jpg", views:{ front:{status:"ready"} } }] }) }));
  await page.route("**/api/admin/avatars/image-settings", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ configured:true, provider:"gemini", model:"gemini-2.5-flash-image", providers:[], modelChoices:["gemini-2.5-flash-image"] }) }));
  await page.route("**/api/sites", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ sites:[] }) }));
  await page.route("**/api/library", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ assets:[] }) }));
  await page.route("**/api/calendar", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ posts:[] }) }));
  await page.route("**/api/campaigns", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ campaigns:[] }) }));
};

function rgb(value:string): [number,number,number] {
  const nums=value.match(/\d+(?:\.\d+)?/g)?.map(Number) || [0,0,0];
  return [nums[0]||0,nums[1]||0,nums[2]||0];
}
function lum([r,g,b]:[number,number,number]){const c=(v:number)=>{const s=v/255;return s<=.03928?s/12.92:Math.pow((s+.055)/1.055,2.4)};return .2126*c(r)+.7152*c(g)+.0722*c(b)}
function ratio(a:[number,number,number],b:[number,number,number]){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}

test("deployed workflow pages expose the requested production UI", async ({ page }) => {
  await BASE_APIS(page);
  const checks:[string,RegExp][]=[
    ["/",/Create campaign content/i],
    ["/avatars",/Avatars/i],
    ["/sites",/^Sites$/i],
    ["/library",/^Library$/i],
    ["/calendar",/Content Calendar/i],
    ["/campaigns",/^Campaigns$/i]
  ];
  for(const [path,heading] of checks){
    await page.goto(path,{waitUntil:"domcontentloaded"});
    await expect(page.getByRole("heading",{name:heading})).toBeVisible({timeout:15000});
  }
});

test("deployed Create keeps providers and canonical avatar choice", async ({ page }) => {
  await BASE_APIS(page);
  await page.goto("/");
  for(const provider of ["Google Veo 3.1","xAI Grok Imagine","A2E AI router","Hedra"]){
    await expect(page.getByRole("button",{name:new RegExp(provider,"i")})).toBeVisible();
  }
  await expect(page.getByText(/Choose canonical avatar/i)).toBeVisible();
  await expect(page.getByRole("option",{name:/Female Anchor 01/i})).toBeAttached();
});

test("deployed Sites is blog and image focused with horizon planning", async ({ page }) => {
  await BASE_APIS(page);
  await page.goto("/sites");
  await expect(page.getByText(/Blog \+ images only/i)).toBeVisible();
  await page.getByRole("button",{name:/Add site/i}).click();
  await expect(page.getByLabel(/CMS \/ publishing target/i)).toBeVisible();
  await expect(page.getByLabel(/Image style/i)).toBeVisible();
  await expect(page.getByText(/No video settings exist in this workflow/i)).toBeVisible();
});

test("deployed Calendar exposes approval manual publish auto-post and all generated media copy", async ({ page }) => {
  await BASE_APIS(page);
  await page.goto("/calendar");
  await expect(page.getByText(/Generated blog drafts, images and videos land here automatically/i)).toBeVisible();
  await expect(page.getByRole("button",{name:/Add post/i})).toBeVisible();
  await expect(page.getByText(/Owner review queue/i)).toBeVisible();
});

test("deployed shared text buttons meet WCAG AA contrast", async ({ page }) => {
  await BASE_APIS(page);
  for(const path of ["/","/sites","/library","/calendar","/avatars","/campaigns"]){
    await page.goto(path);
    const buttons=page.locator("button:not([disabled])");
    for(let i=0;i<await buttons.count();i++){
      const b=buttons.nth(i);
      if(!(await b.isVisible())) continue;
      const text=(await b.innerText()).trim();
      if(!text) continue;
      const s=await b.evaluate(el=>{const x=getComputedStyle(el);return {fg:x.color,bg:x.backgroundColor}});
      if(s.bg==="rgba(0, 0, 0, 0)"||s.bg==="transparent") continue;
      expect(ratio(rgb(s.fg),rgb(s.bg)),`${path}: ${text}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
