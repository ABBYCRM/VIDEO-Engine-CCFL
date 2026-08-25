import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Campaigns manages saved plans without duplicating Create builder",async({page})=>{
  await stubAuthenticatedSession(page);
  await page.route("**/api/campaigns",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({campaigns:[{id:"campaign-1",name:"Florida mixed campaign",category:"car_accident",mission:"Explain a useful post-collision step.",contentType:"newsroom",outputMode:"auto_mix",planningHorizonDays:14,status:"draft",createdAt:new Date().toISOString()}]})}));
  await page.goto("/campaigns");
  await expect(page.getByRole("heading",{name:"Campaigns"})).toBeVisible();
  const saved=page.locator("article").filter({hasText:"Florida mixed campaign"});
  await expect(saved).toBeVisible();
  await expect(saved.getByText(/Auto mix/i)).toBeVisible();
  await expect(saved.getByText(/14 days/)).toBeVisible();
  await expect(page.getByText("Campaign Builder")).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Create campaign \+ fill Calendar/i})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Create campaign",exact:true})).toBeVisible();
  await expect(saved.getByRole("link",{name:"Calendar",exact:true})).toBeVisible();
});
