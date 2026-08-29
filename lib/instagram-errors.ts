type MetaError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

function scrubSecrets(value: string): string {
  return value
    .replace(/([?&](?:access_token|appsecret_proof)=)[^&\s]+/gi, "$1***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/EAA[A-Za-z0-9]+/g, "EAA…")
    .replace(/IGQV[A-Za-z0-9]+/g, "IGQV…");
}

function parseJsonFragment(value: string): unknown {
  const start = value.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(value.slice(start));
  } catch {
    return null;
  }
}

function findMetaError(value: unknown, depth = 0): MetaError | null {
  if (depth > 6 || value == null) return null;
  if (value instanceof Error) {
    return findMetaError(parseJsonFragment(value.message), depth + 1);
  }
  if (typeof value === "string") {
    return findMetaError(parseJsonFragment(value), depth + 1);
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.code === "number" || typeof obj.error_subcode === "number") {
    return {
      message: typeof obj.message === "string" ? obj.message : undefined,
      type: typeof obj.type === "string" ? obj.type : undefined,
      code: typeof obj.code === "number" ? obj.code : undefined,
      error_subcode: typeof obj.error_subcode === "number" ? obj.error_subcode : undefined
    };
  }
  for (const key of ["error", "data", "response", "cause"]) {
    const found = findMetaError(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function rawMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Turn Composio/Meta's often-empty nested errors into a safe operator-facing
 * message. Code 100/subcode 33 means Meta cannot load the requested object
 * with the connected token (wrong account, missing scope, stale connection,
 * or a Meta-side authorization incident). It is not fixed by retrying with a
 * guessed media id, so the message tells the operator what must be checked.
 */
export function formatInstagramToolError(label: string, value: unknown): string {
  const meta = findMetaError(value);
  if (meta?.code === 100 && meta.error_subcode === 33) {
    return `${label}: Meta denied access to this media (code 100, subcode 33). Reconnect Instagram in Settings using the Business/Creator account that owns the media and grant instagram_basic plus instagram_manage_comments.`;
  }

  const detail = meta?.message?.trim()
    || (meta?.type ? `${meta.type}${meta.code ? ` (code ${meta.code}${meta.error_subcode ? `, subcode ${meta.error_subcode}` : ""})` : ""}` : "")
    || rawMessage(value)
    || "Unknown Instagram error";
  const safe = scrubSecrets(detail).slice(0, 700);
  return safe.startsWith(`${label}:`) ? safe : `${label}: ${safe}`;
}
