// Pure hash logic for lib/post-dedup.ts, split into its own zero-dependency
// module so it's directly testable under raw `node --test` (which can't
// resolve the @/ path alias lib/post-dedup.ts needs for its @/lib/db
// import — same constraint documented in
// tests/unit/aion-policy-completeness.test.ts).

import crypto from "node:crypto";

export type PostHashInput = {
  network: string;
  contentType: string;
  caption: string;
  /** An extra identity component for callers whose caption alone isn't a
   *  reliable fingerprint of "the same submission" -- e.g.
   *  creator_upload_video hashes the uploaded file's bytes here, since a
   *  resubmitted file gets a freshly generated storage URL each time and
   *  would otherwise never match. Optional; defaults to "". */
  identity?: string;
};

export function computePostHash(input: PostHashInput): string {
  // Length-prefix every field before joining so no field's content can
  // shift a boundary and collide with a differently-split neighbor.
  const parts = [input.network, input.contentType, input.identity || "", input.caption];
  const key = parts.map((p) => `${p.length}:${p}`).join("|");
  return crypto.createHash("sha256").update(key).digest("hex");
}
