import { expect, test } from "@playwright/test";
import { openNavigationIfNeeded, stubAuthenticatedSession } from "./helpers";
const routes=[["Campaigns","/campaigns"],["Avatars","/avatars"],["Sites","/sites"],["Library","/library"],["Calendar","/calendar"],["Integrations","/integrations"],["API","/docs"],["Settings","/settings"]] as const;
test.beforeEach(async({page})=>{await stubAuthenticatedSession(page);});
test("every primary navigation link reaches a real page",async({page})=>{
  for(const[label,path]of routes){
    await page.goto("/");
    await expect(page.getByRole("heading",{name:"Create campaign content"})).toBeVisible();
    await openNavigationIfNeeded(page);
    const link=page.getByRole("link",{name:label,exact:true});
    await expect(link).toBeVisible();
    await Promise.all([page.waitForURL(new RegExp(`${path.replaceAll("/","\\/")}$`)),link.click()]);
    await expect(page.locator("main").last()).toBeVisible();
  }
});
test("podcast is a real create mode instead of duplicate sidebar navigation",async({page})=>{await page.goto("/");await page.getByRole("link",{name:/Podcast \/ split-screen/i}).click();await expect(page).toHaveURL(/\/podcast-interview$/);await expect(page.getByRole("heading",{name:"Podcast Composer"})).toBeVisible();});
test("site controls open the real Sites workspace",async({page})=>{await page.goto("/");await openNavigationIfNeeded(page);await page.getByRole("link",{name:"Open CaseClosedFL site"}).click();await expect(page).toHaveURL(/\/sites$/);await expect(page.getByRole("heading",{name:"Sites"})).toBeVisible();await page.goto("/");await openNavigationIfNeeded(page);await page.getByRole("link",{name:"Manage websites"}).click();await expect(page).toHaveURL(/\/sites$/);});
