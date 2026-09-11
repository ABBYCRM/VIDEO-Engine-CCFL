import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyValue,
  fieldAccepts,
  isGoogleEmail,
  loginHints,
  classifyAuthState,
} from "../../lib/browser-computer/login.ts";
import type { InteractiveNode } from "../../lib/browser-computer/types.ts";

const phone: InteractiveNode = {
  tag: "input",
  text: "",
  type: "tel",
  name: "phone",
  placeholder: "Phone",
  x: 10,
  y: 10,
  w: 100,
  h: 20,
};
const email: InteractiveNode = {
  tag: "input",
  text: "",
  type: "email",
  name: "email",
  placeholder: "Email or username",
  x: 10,
  y: 40,
  w: 100,
  h: 20,
};
const googleBtn: InteractiveNode = {
  tag: "button",
  text: "Continue with Google",
  x: 10,
  y: 80,
  w: 160,
  h: 24,
};
const emailSwitch: InteractiveNode = {
  tag: "a",
  text: "Log in with email / username",
  x: 200,
  y: 8,
  w: 160,
  h: 16,
};

describe("computer login routing", () => {
  it("classifies gmail vs phone vs otp", () => {
    assert.equal(classifyValue("palsabrazilfl@gmail.com"), "email");
    assert.equal(isGoogleEmail("palsabrazilfl@gmail.com"), true);
    assert.equal(classifyValue("+1 3055551212"), "phone");
    assert.equal(classifyValue("123456"), "otp");
  });

  it("refuses to put an email in a phone field", () => {
    assert.equal(fieldAccepts(phone, "email"), false);
    assert.equal(fieldAccepts(email, "email"), true);
  });

  it("tells Claw to use Google SSO and not the phone box", () => {
    const hints = loginHints(
      {
        title: "Log in",
        text: "Phone Log in with email / username",
        elements: [phone, googleBtn, emailSwitch],
      },
      "palsabrazilfl@gmail.com",
    );
    assert.ok(hints.some((h) => /Gmail/i.test(h)));
    assert.ok(hints.some((h) => /Phone/i.test(h)));
    assert.ok(hints.some((h) => /email/i.test(h)));
  });

  it("stops looping when Google rejects the browser", () => {
    const hints = loginHints({
      title: "Couldn't sign you in",
      text: "This browser or app may not be secure. Try using a different browser.",
      elements: [],
    });
    assert.ok(hints.some((h) => /rejected/i.test(h)));
    assert.equal(
      classifyAuthState({
        url: "https://accounts.google.com",
        title: "Couldn't sign you in",
        text: "This browser or app may not be secure.",
        elements: [],
        suspicious: [],
      }),
      "SSO_BLOCKED",
    );
  });
});
