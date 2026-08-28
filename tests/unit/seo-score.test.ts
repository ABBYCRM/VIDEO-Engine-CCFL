import assert from "node:assert/strict";
import test from "node:test";
import { scoreSeoPost } from "../../lib/seo/score.ts";

test("scoreSeoPost passes every check for a well-formed article", () => {
  const title = "Car Accident Lawyer Advice: What To Do After A Crash";
  const result = scoreSeoPost({
    title,
    metaTitle: title,
    metaDescription: "This meta description is written to land comfortably inside the one hundred twenty to one hundred sixty character window that search engines actually render.",
    focusKeyword: "car accident lawyer",
    bodyMarkdown: [
      "Car accident lawyer advice starts with documenting the scene.",
      "",
      "## What to do first",
      "",
      "Call the police and seek medical attention immediately after any collision.",
      "",
      "## Insurance next steps",
      "",
      "Notify your insurer and keep every record you can. ".repeat(46)
    ].join("\n"),
    slug: "car-accident-lawyer-advice"
  });
  assert.equal(result.score, result.maxScore);
});

test("scoreSeoPost flags a short slug, missing keyword, and thin body", () => {
  const result = scoreSeoPost({
    title: "Short",
    metaTitle: "Short",
    metaDescription: "Too short",
    focusKeyword: null,
    bodyMarkdown: "Just one thin sentence.",
    slug: "Not A Valid Slug!"
  });
  assert.ok(result.score < result.maxScore);
  const byId = Object.fromEntries(result.checks.map((c) => [c.id, c.pass]));
  assert.equal(byId["keyword-present"], false);
  assert.equal(byId["min-length"], false);
  assert.equal(byId["slug-format"], false);
});
