// lib/db-postgres.ts
// Thin PostgreSQL adapter that exposes the same `db.prepare(...)` API as
// better-sqlite3 so the existing call sites (lib/jobs.ts, lib/settings.ts,
// lib/avatars.ts, lib/composio/client.ts, all the /api routes) keep
// working without a massive refactor.
//
// The mapping:
//   sqlite:  db.prepare("...").get(...args)       -> { ... } | undefined
//   pg:      sql`...` with positional parameters  -> [{ ... }] | []
//   sqlite:  db.prepare("...").all(...args)       -> [{ ... }, ...]
//   pg:      sql`...`                              -> [{ ... }, ...]
//   sqlite:  db.prepare("...").run(...args)       -> { changes, lastInsertRowid }
//   pg:      sql`...`                              -> [{ ... }]
//
// Our adapter unifies these to:
//   db.prepare(sqlText).get(...args)        -> first row | undefined
//   db.prepare(sqlText).all(...args)        -> array of rows
//   db.prepare(sqlText).run(...args)        -> { changes: rowCount }
//   db.prepare(sqlText).values(...args)     -> array of values (e.g. SELECT col)
//
// We translate ? placeholders to postgres.js's $1, $2, ... so the SQL
// strings can be authored once in a dialect-neutral form.

type Positional = (string | number | boolean | null | Date | Buffer | unknown[])[];

let pgClient: any = null;
async function getPg() {
  if (pgClient) return pgClient;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const postgres = (await import("postgres")).default;
  pgClient = postgres(url, { ssl: "require", onnotice: () => {}, max: 10 });
  return pgClient;
}

function convertPlaceholders(sql: string): { text: string; argCount: number } {
  // Count ? (must NOT be inside a string literal — we don't fully parse
  // SQL but for our DDL/DML strings it's safe).
  let argCount = 0;
  const text = sql.replace(/\?/g, () => {
    argCount++;
    return `$${argCount}`;
  });
  return { text, argCount };
}

type Statement = {
  get(...args: Positional): Promise<any | undefined>;
  all(...args: Positional): Promise<any[]>;
  run(...args: Positional): Promise<{ changes: number; lastInsertRowid?: string | number }>;
  values(...args: Positional): Promise<any[]>;
};

class PgStatement implements Statement {
  constructor(private sqlText: string) {}
  private async exec(method: "get" | "all" | "run" | "values", args: Positional) {
    const pg = await getPg();
    const { text, argCount } = convertPlaceholders(this.sqlText);
    if (argCount !== args.length) {
      throw new Error(`SQL param mismatch for "${this.sqlText.slice(0, 60)}...": expected ${argCount}, got ${args.length}`);
    }
    const result = args.length ? await pg.unsafe(text, args as any[]) : await pg.unsafe(text);
    if (method === "get") {
      return Array.isArray(result) && result.length ? result[0] : undefined;
    }
    if (method === "all") {
      return Array.isArray(result) ? result : [];
    }
    if (method === "values") {
      return Array.isArray(result) ? result.map((r: any) => Object.values(r)) : [];
    }
    // run
    if (Array.isArray(result)) {
      return { changes: result.length, lastInsertRowid: undefined };
    }
    return { changes: 1 };
  }
  get(...args: Positional) { return this.exec("get", args); }
  all(...args: Positional) { return this.exec("all", args); }
  run(...args: Positional) { return this.exec("run", args); }
  values(...args: Positional) { return this.exec("values", args); }
}

class PgDatabase {
  prepare(sqlText: string) { return new PgStatement(sqlText); }
  // The sqlite db has .pragma() and .exec() for raw SQL. The PG adapter
  // exposes .exec() for the same DDL bootstrap path. .pragma() is a no-op
  // (postgres has no PRAGMAs).
  async exec(sqlText: string) {
    const pg = await getPg();
    await pg.unsafe(sqlText);
  }
  pragma(_name: string) { /* no-op on PG */ }
  // Transaction helper used by lib/db.ts seedDefaultAvatars() flow.
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    const pg = await getPg();
    return await pg.begin(async () => fn()) as T;
  }
}

export async function createPgDatabase(): Promise<PgDatabase> {
  // Touch the client once so connection errors surface at startup, not on
  // first query.
  await getPg();
  return new PgDatabase();
}

export function isPgConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
