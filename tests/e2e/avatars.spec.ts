import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const providers = [
  { id: "nvidia", label: "NVIDIA FLUX.2 Klein 4B", envVar: "NVIDIA_API_KEY", help: "Reference editing with base64 input.", models: ["black-forest-labs/flux.2-klein-4b"], supportsTurnaround: true },
  { id: "gemini", label: "Google Gemini image generation", envVar: "GEMINI_API_KEY", help: "Reference editing.", models: ["gemini-2.5-flash-image"], supportsTurnaround: true },
  { id: "openai", label: "OpenAI image generation", envVar: "OPENAI_API_KEY", help: "Reference editing fallback.", models: ["gpt-image-1"], supportsTurnaround: true },
  { id: "xai", label: "xAI Grok Imagine", envVar: "XAI_API_KEY", help: "Fresh portraits only.", models: ["grok-imagine-image"], supportsTurnaround: false }
];
const modelChoices=(provider:string)=>provider==="nvidia"?["black-forest-labs/flux.2-klein-4b"]:provider==="openai"?["gpt-image-1"]:provider==="xai"?["grok-imagine-image"]:["gemini-2.5-flash-image"];

test("avatar image settings can select NVIDIA FLUX turnaround", async ({ page }) => {
  await stubAuthenticatedSession(page);
  let saved:any={configured:true,provider:"gemini",model:"gemini-2.5-flash-image",providers,modelChoices:["gemini-2.5-flash-image"]};
  await page.route("**/api/admin/avatars", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({avatars:[]})}));
  await page.route("**/api/admin/avatars/image-settings", async route => {
    if(route.request().method()==="POST"){
      const input=await route.request().postDataJSON();
      saved={configured:true,provider:input.provider,model:input.model,providers,modelChoices:modelChoices(input.provider)};
    }
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(saved)});
  });
  await page.goto("/avatars");
  await page.getByRole("button",{name:/Image: gemini/i}).click();
  await page.getByRole("button",{name:/NVIDIA FLUX.2 Klein 4B/i}).click();
  await expect(page.getByLabel("Model")).toHaveValue("black-forest-labs/flux.2-klein-4b");
  await expect(page.getByRole("button",{name:/xAI Grok Imagine/i})).toBeDisabled();
  await page.getByRole("button",{name:"Save"}).click();
  await expect(page.getByRole("button",{name:/Image: nvidia · black-forest-labs\/flux.2-klein-4b/i})).toBeVisible();
});

test("gemini spending cap failure is summarized and recoverable", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const failedView={file:null,status:"missing",generationStatus:"failed",generationModel:"gemini-2.5-flash-image",generationError:"Gemini image API HTTP 429: project has exceeded its monthly spending cap"};
  await page.route("**/api/admin/avatars", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({avatars:[{id:"female-anchor-01",name:"Female Anchor 01",gender:"female",archetype:"newsroom spokesperson",wardrobeStandard:"tailored blazer / blouse / slacks",notes:"Professional newsroom anchor",referenceImage:"/avatars/female-anchor-01/identity.jpg",referenceImageNote:null,wardrobeRegenerationPrompt:null,status:"draft",turnaroundStatus:"failed",turnaroundModel:"gemini-2.5-flash-image",turnaroundError:failedView.generationError,views:{front:failedView,left:failedView,right:failedView,back:failedView}}]})}));
  await page.route("**/api/admin/avatars/image-settings", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({configured:true,provider:"gemini",model:"gemini-2.5-flash-image",providers,modelChoices:["gemini-2.5-flash-image"]})}));
  await page.route("**/api/admin/avatars/female-anchor-01/reset?all=true", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true})}));
  await page.goto("/avatars");
  await expect(page.getByText("Gemini spending cap reached")).toBeVisible();
  await expect(page.getByText(/The failure is upstream billing/)).toBeVisible();
  await expect(page.getByText(/Gemini image generation is blocked by the project spending cap/).first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Clear failed state"})).toBeVisible();
});
