import { expect,test } from "@playwright/test";
import { openNavigationIfNeeded,stubAuthenticatedSession } from "./helpers";
const routes=[["Campaigns","/campaigns"],["Avatars","/avatars"],["Sites","/sites"],["Library","/library"],["Calendar","/calendar"],["Integrations","/integrations"],["API","/docs"],["Settings","/settings"]] as const;
test.beforeEach(async({page})=>{await stubAuthenticatedSession(page)});

test("every primary navigation link reaches a real page",async({page})=>{for(const[label,path]of routes){await page.goto("/");await expect(page.getByRole("heading",{name:"Create campaign content"})).toBeVisible();await openNavigationIfNeeded(page);const link=page.getByRole("link",{name:label,exact:true});await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/","\\/")}$`),{timeout:10000});await expect(page.locator("main").last()).toBeVisible()}});

test("podcast is a real Create mode instead of duplicate sidebar navigation",async({page})=>{await page.goto("/");await page.getByRole("link",{name:/Podcast \/ split-screen/i}).click();await expect(page).toHaveURL(/\/podcast-interview$/);await expect(page.getByRole("heading",{name:"Podcast / split-screen composer"})).toBeVisible();await openNavigationIfNeeded(page);await expect(page.getByRole("link",{name:"Podcast / split-screen",exact:true})).toHaveCount(0)});

test("Sites has one canonical navigation entry",async({page})=>{await page.goto("/");await openNavigationIfNeeded(page);const sites=page.getByRole("link",{name:"Sites",exact:true});await expect(sites).toHaveCount(1);await sites.click();await expect(page).toHaveURL(/\/sites$/);await expect(page.getByRole("heading",{name:"Sites"})).toBeVisible()});
