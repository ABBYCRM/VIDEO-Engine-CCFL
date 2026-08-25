import { expect,test } from "@playwright/test";
import { openNavigationIfNeeded,stubAuthenticatedSession } from "./helpers";
const routes=[["Avatars","/avatars"],["Library","/library"],["Calendar","/calendar"]] as const;
const tabs=[["Campaigns","tab=campaigns"],["Sites","tab=sites"],["Connections","tab=connections"],["Settings","tab=settings"]] as const;
test.beforeEach(async({page})=>{await stubAuthenticatedSession(page)});

test("every primary navigation link reaches a real page",async({page})=>{for(const[label,path]of routes){await page.goto("/");await expect(page.getByRole("heading",{name:"Create"})).toBeVisible();await openNavigationIfNeeded(page);const link=page.getByRole("link",{name:label,exact:true});await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/","\\/")}$`),{timeout:10000});await expect(page.locator("main").last()).toBeVisible()}});

test("the other functions are tabs inside Create, not separate nav entries",async({page})=>{await page.goto("/");await openNavigationIfNeeded(page);for(const[label]of tabs)await expect(page.getByRole("navigation").getByRole("link",{name:label,exact:true})).toHaveCount(0);for(const[label,query]of tabs){await page.goto("/");await page.getByRole("button",{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(`\\?${query}$`));await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-current","page")}});

test("old standalone routes redirect into the matching Create tab",async({page})=>{await page.goto("/sites");await expect(page).toHaveURL(/\?tab=sites$/);await expect(page.getByRole("heading",{name:"Sites"})).toBeVisible();await page.goto("/settings");await expect(page).toHaveURL(/\?tab=settings$/);await expect(page.getByRole("button",{name:"Settings",exact:true})).toHaveAttribute("aria-current","page")});

test("podcast is an explicit Create mode instead of duplicate sidebar navigation",async({page})=>{await page.goto("/");await page.getByLabel("Content format").selectOption("podcast");const entry=page.getByRole("link",{name:"Continue to two-lane production",exact:true});await expect(entry).toBeVisible();await entry.click();await expect(page).toHaveURL(/\/podcast-interview(?:\?.*)?$/);await expect(page.getByRole("heading",{name:"Two-lane campaign production"})).toBeVisible();await openNavigationIfNeeded(page);await expect(page.getByRole("navigation").getByRole("link",{name:"Podcast / split-screen",exact:true})).toHaveCount(0)});
