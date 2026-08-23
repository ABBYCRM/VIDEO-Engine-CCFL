import postgres from "postgres";

export type PersistentLibraryAsset = {
  id: string;
  kind: string;
  mediaType: "image" | "video";
  label: string;
  title: string;
  mimeType: string;
  model?: string | null;
  prompt?: string | null;
  createdAt: string;
  url: string;
};

type SaveAssetInput = {
  id: string;
  kind: string;
  mediaType: "image" | "video";
  label: string;
  title: string;
  mimeType: string;
  bytes: Buffer | Uint8Array;
  model?: string | null;
  prompt?: string | null;
  metadata?: Record<string, unknown> | null;
};

const connectionString = process.env.DATABASE_URL?.trim() || "";
const globalForPg = globalThis as unknown as { videoEnginePg?: ReturnType<typeof postgres> };
const sql = connectionString
  ? (globalForPg.videoEnginePg ?? postgres(connectionString, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: "require"
    }))
  : null;
if (sql && process.env.NODE_ENV !== "production") globalForPg.videoEnginePg = sql;

let initPromise: Promise<void> | null = null;
async function ensureSchema() {
  if (!sql) return;
  initPromise ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS library_assets (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
        label TEXT NOT NULL,
        title TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        model TEXT,
        prompt TEXT,
        content BYTEA NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_library_assets_created_at ON library_assets(created_at DESC)`;
  })();
  await initPromise;
}

export function persistentLibraryConfigured() {
  return Boolean(sql);
}

export async function savePersistentLibraryAsset(input: SaveAssetInput): Promise<string | null> {
  if (!sql) return null;
  await ensureSchema();
  const bytes = Buffer.from(input.bytes);
  await sql`
    INSERT INTO library_assets (
      id, kind, media_type, label, title, mime_type, model, prompt, content, metadata, created_at, updated_at
    ) VALUES (
      ${input.id}, ${input.kind}, ${input.mediaType}, ${input.label}, ${input.title}, ${input.mimeType},
      ${input.model ?? null}, ${input.prompt?.slice(0, 10000) ?? null}, ${bytes},
      ${sql.json((input.metadata ?? {}) as any)}, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind,
      media_type = EXCLUDED.media_type,
      label = EXCLUDED.label,
      title = EXCLUDED.title,
      mime_type = EXCLUDED.mime_type,
      model = EXCLUDED.model,
      prompt = EXCLUDED.prompt,
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `;
  return `/api/library/assets/${encodeURIComponent(input.id)}/file`;
}

export async function listPersistentLibraryAssets(limit = 500): Promise<PersistentLibraryAsset[]> {
  if (!sql) return [];
  await ensureSchema();
  const rows = await sql<{
    id: string;
    kind: string;
    media_type: "image" | "video";
    label: string;
    title: string;
    mime_type: string;
    model: string | null;
    prompt: string | null;
    created_at: string;
  }[]>`
    SELECT id, kind, media_type, label, title, mime_type, model, prompt, created_at
    FROM library_assets
    ORDER BY created_at DESC
    LIMIT ${Math.max(1, Math.min(1000, limit))}
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    mediaType: row.media_type,
    label: row.label,
    title: row.title,
    mimeType: row.mime_type,
    model: row.model,
    prompt: row.prompt,
    createdAt: new Date(row.created_at).toISOString(),
    url: `/api/library/assets/${encodeURIComponent(row.id)}/file`
  }));
}

export async function getPersistentLibraryAsset(id: string): Promise<{ bytes: Buffer; mimeType: string; title: string } | null> {
  if (!sql) return null;
  await ensureSchema();
  const rows = await sql<{ content: Uint8Array; mime_type: string; title: string }[]>`
    SELECT content, mime_type, title FROM library_assets WHERE id = ${id} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { bytes: Buffer.from(row.content), mimeType: row.mime_type, title: row.title };
}
