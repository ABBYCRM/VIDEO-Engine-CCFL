// Custom 404 handler. Without this, the App Router falls back to the
// built-in Next.js default 404 page (a black "404 | This page could not
// be found." screen), which is what the operator was seeing on Android
// Chrome when they opened the app and were bounced to a stale URL like
// /login (a route that was removed in the 2026-08-30 "Claw only" strip).
//
// The right behavior for a private single-page app like this is: any URL
// that doesn't match a real route sends the visitor straight to the
// Claw console, which is the only screen that matters. We do it with a
// server-side redirect so the address bar is correct on landing and the
// page tree is empty afterwards.
import { redirect } from "next/navigation";

export default function NotFound() {
  redirect("/claw");
}
