// lib/claw/dev-skills.ts — Claw's developer knowledge base.
//
// 2026-08-30 "Claw only" + "create a RAG of dev skills and coding skills
// e2e" operator directive. The operator does NOT want the generic
// "communicate clearly" / "be concise" / "use chain-of-thought" soft
// skills that show up in every LLM system prompt. They want a
// concrete, code-grounded knowledge base that lets Claw answer real
// developer questions: how do you write a Next.js App Router route
// handler, what does the SQL LIKE escape sequence look like, how do
// you wire a Stripe webhook, etc.
//
// This module is a curated corpus of condensed, opinionated, code-
// anchored developer knowledge, organized as a flat list of "skill"
// records. Each record has a stable id, a category, a 1-line
// summary, and a body. Claw's runtime can call the
// `dev_search` tool (see lib/claw/tools.ts) to grep this corpus by
// category and keyword, and the LLM injects the top matches into
// its own context before answering. This is "RAG" in the literal
// sense: a retrieval step, then augmented generation.
//
// The corpus is split into four sections:
//   1. Languages  (TS/JS, Python, Go, Rust, SQL, Bash, JSON/YAML,
//                  HTML/CSS, RegExp, GraphQL, Swift, Kotlin, PHP, Ruby,
//                  C/C++, Java)
//   2. Frameworks (Next.js, React, Express, FastAPI, Django, Svelte,
//                  Vue, Rails, Spring Boot, Flutter, Tauri, Electron,
//                  React Native, Astro, Nuxt, Solid, SvelteKit, Remix)
//   3. Infra     (Linux, Docker, nginx, Postgres, MySQL, SQLite,
//                  Redis, MongoDB, Kafka, RabbitMQ, GraphQL servers,
//                  WebSockets, gRPC, REST, OpenAPI, DNS, TLS, OAuth2,
//                  JWT, SAML, mTLS, GraphQL federation, Envoy, Istio,
//                  Linkerd, Caddy, Traefik, HAProxy, Prometheus,
//                  Grafana, OpenTelemetry, Datadog, Sentry, Loki,
//                  Tempo, Mimir, Thanos, VictoriaMetrics, Cloudflare,
//                  AWS, GCP, Azure, Fly, Render, Railway, Vercel,
//                  Netlify, Heroku, DigitalOcean, Linode, Hetzner,
//                  Vultr, OVH)
//   4. Patterns   (auth, error handling, pagination, caching, rate
//                  limiting, observability, testing, security, data
//                  modeling, migrations, code review, refactoring,
//                  dependency mgmt, supply-chain security, secrets
//                  management, API design, idempotency, eventual
//                  consistency, sharding, partitioning, CDC, event
//                  sourcing, CQRS, sagas, outbox, retries+backoff,
//                  circuit breakers, bulkheads, rate-limit token
//                  buckets, sliding-window counters)
//
// Each skill is small (5-30 lines) and self-contained. The LLM
// should treat this corpus as a dictionary, not a tutorial: look up
// the precise API/idiom, paste the exact shape, don't paraphrase.
//
// Future operator work (per the 2026-08-30 directive "I will add them
// back one by one while I am using it"): the operator will likely
// want to add a `add_dev_skill(category, summary, body)` API so new
// patterns from their real usage land in this corpus on the fly. The
// storage layer (lib/dev-skills-store.ts) is intentionally a tiny
// SQLite table on top of the Claw chat tables so additions survive
// restarts.

export type DevSkill = {
  id: string;
  category: "language" | "framework" | "infra" | "pattern";
  tags: string[];
  summary: string;
  body: string;
};

// ─── Languages ──────────────────────────────────────────────────────
const LANGUAGES: DevSkill[] = [
  {
    id: "ts.types",
    category: "language",
    tags: ["typescript", "types", "generics", "narrowing"],
    summary: "TypeScript types: structural, generics, narrowing, branded primitives",
    body: `Structural typing: types are compatible by shape, not name. {a:1} matches {a:1,b:2} for the wider side (excess-property checks block object literals with extra keys).
Generics: <T extends {id:string}>(x:T) => T["id"] — extend for constraints, default with <T = string>.
Narrowing: typeof x === "string" narrows. "in" operator: "kind" in x narrows discriminated unions. Custom type guards: function isFoo(x:unknown): x is Foo.
Branded primitives: type UserId = string & {__brand:"UserId"}; prevents passing a ProductId where a UserId is expected.
satisfies: const cfg = {port:3000} satisfies Config; — type-check without widening the literal.
Const assertions: as const on a literal freezes the value to its narrowest type.
Utility types: Partial, Required, Readonly, Pick, Omit, Record, Exclude, Extract, ReturnType, Parameters, Awaited.
Indexed access: T[K] for "give me the type of the K property of T".
keyof: type K = keyof T — union of property names.
Template literal types: type Event = \`on\${Capitalize<Name>}\`;`
  },
  {
    id: "ts.async",
    category: "language",
    tags: ["typescript", "async", "promise", "await", "error"],
    summary: "Async/Promise mechanics, error propagation, race conditions, backpressure",
    body: `await unwraps a Promise. await Promise.all([...]) parallelizes; .allSettled never rejects. Promise.race rejects on the first rejection (use allSettled if you want a winner-takes-all semantics).
Top-level await is legal in ESM (Next.js App Router server actions, Vite, etc.).
Unhandled rejections crash Node 15+ by default. Always .catch() or wrap in try/await.
AbortController: pair fetch with req.signal to cancel server-side work when the client disconnects. Pass signal to the database call too (better-sqlite3 doesn't support it; pg does).
Event loop: microtasks (Promises) drain before macrotasks (setTimeout, setImmediate). Don't use setTimeout(fn,0) to "yield"; use queueMicrotask.
Stream large responses: use a ReadableStream + controller.enqueue(chunk) rather than building one giant string.
For-await-of for async iterables (Node streams, Web ReadableStream, DynamoDB paginators, etc.).
Backpressure: pause/resume streams; never buffer unbounded.
Common bug: forEach with async callbacks doesn't await them. Use for...of or Promise.all(map(...)).`
  },
  {
    id: "ts.module",
    category: "language",
    tags: ["typescript", "esm", "import", "export", "module", "bundler"],
    summary: "ES modules, CJS interop, dynamic imports, tree-shaking",
    body: `Named vs default exports: prefer named. Default exports are a refactor magnet because IDEs don't auto-rename across them.
type-only import: import type {Foo} from "..."; ensures the symbol is erased at compile time.
Dynamic import: const m = await import("./big-module"); is a real code-split boundary; bundlers create a separate chunk.
Top-level await: legal in ESM. Side effects run on import.
CJS interop: import x from "cjs"; gets module.exports. import {x} from "cjs"; goes through __esModule interop.
__dirname in ESM: use import.meta.url + new URL(".", import.meta.url).pathname.
Tree-shaking: side-effect-free ES modules can be tree-shaken. "sideEffects": false in package.json tells webpack/rollup to drop unused exports.
Module resolution: Node uses "exports" field in package.json. "import" / "require" / "types" conditions. Path aliases (#/components/X) require tsconfig "paths" + bundler config (Next.js handles this automatically).`
  },
  {
    id: "ts.nextjs",
    category: "language",
    tags: ["typescript", "next.js", "react", "ssr", "rsc", "app router"],
    summary: "Next.js App Router: server components, route handlers, middleware, caching",
    body: `App Router lives in app/. Each folder = a route segment. page.tsx = the page UI. layout.tsx = shared chrome. loading.tsx / error.tsx / not-found.tsx = conventions. route.ts = API endpoint.
Server components by default. Add "use client" at the top of a file to make it a client component. Keep server components at the leaves; only the parts that need state/effects go client.
Server actions: async functions in "use server" files (or inline in a server component). They run on the server, can mutate, and are called from the client like regular async functions.
Route handlers: export async function GET(req: Request, ctx: {params: {id:string}}) { return new Response(...) }. Use NextResponse.json({...}) for typed JSON. req.signal is the AbortSignal — wire it into the DB call.
Caching: fetch is cached by default in App Router. opt out with {cache:"no-store"}. For DB queries, use {next: {revalidate: 60}} for time-based, or {tags: ["post:123"]} for tag-based revalidation.
Middleware (middleware.ts at the project root) runs on every request before the route handler. Use it for auth gates, A/B testing, geo redirects, etc.
Streaming: <Suspense fallback={...}> wraps server components that do slow work. The fallback renders immediately; the real content streams in.
Server-only modules: import "server-only" throws at build time if the file ends up in a client bundle.
Image optimization: next/image. Always set width/height or fill + sizes. The default loader is sharp; for AVIF/WebP, set formats: ['image/avif','image/webp'] in next.config.
Route groups: (marketing) wraps a folder without affecting the URL. Use it to share a layout between a subset of routes.
Parallel routes: @modal, @sidebar etc. render in named slots of a layout. Useful for modals that have their own URL.
Intercepting routes: (..)photo/[id]/page.tsx intercepts the /photo/[id] route when navigated from a parent. The canonical URL is preserved.`
  },
  {
    id: "ts.react",
    category: "language",
    tags: ["react", "hooks", "state", "rerender", "memo"],
    summary: "React 18+: hooks rules, render boundaries, memoization, suspense, transitions",
    body: `Rules of hooks: only call at the top level, only call from React functions. The linter (eslint-plugin-react-hooks) enforces both.
useState initializer: pass a function for the lazy form: useState(() => expensive()). Otherwise the expression runs every render.
useEffect: runs after paint. Use useLayoutEffect for measurements (synchronous, blocks paint). Don't put data-fetching in useEffect if you can use a server component, a server action, or React Query.
useMemo / useCallback: only memoize when the downstream cost is real and the inputs are referentially unstable. Don't pre-memoize — it just adds noise and a closure to debug.
useRef: mutable container that doesn't trigger re-renders. Use it for DOM handles, timers, previous-value tracking.
useReducer: prefer over useState when the next state depends on the previous one in a non-trivial way, or when multiple actions mutate the same state.
useTransition: marks a state update as non-urgent. Useful for typing-into-search-input: the input stays snappy, the results update after the current paint.
useDeferredValue: same as useTransition but for a value rather than an update.
useId: stable id for SSR. use it for aria-describedby, etc. Never call Math.random() in render.
useSyncExternalStore: subscribe to a non-React mutable store (Zustand, Redux, etc.) the React 18 way.
use(client): opt this file (and its imports) into the client bundle.
React Compiler (React 19+): no more manual useMemo/useCallback; the compiler infers them. The linter is being phased out for this reason.
Keys in lists: stable, unique, not array index. Use a database id. Index keys break reordering, prepend/append, and any inline animation.
Controlled vs uncontrolled inputs: prefer uncontrolled (useRef + defaultValue) for forms that don't need live validation. It's fewer re-renders.
RSC payload: client components serialize as references. Don't put non-serializable values (functions, class instances) in props from server to client.
Hydration: server renders the first paint; client attaches event listeners. Mismatch throws. Make sure date.now(), Math.random(), window checks are guarded or in useEffect.`
  },
  {
    id: "ts.sql",
    category: "language",
    tags: ["sql", "sqlite", "postgres", "index", "join", "explain"],
    summary: "SQL: joins, indexes, EXPLAIN, transactions, parameterization, migrations",
    body: `Always parameterize. Never string-interpolate user input. SQLite uses ? placeholders, postgres uses $1, $2.
LIKE wildcards: % = any, _ = one char. To match a literal % or _, escape: sp.error LIKE '%isn' || char(39) || 't supported%'  (apostrophe escape for SQLite tokenization).
Indexes: B-tree by default. Composite indexes (a,b) only help queries that filter on a or (a,b) — not b alone. Use EXPLAIN to confirm the planner uses them.
Covering index: include the SELECT columns in the index so the heap never gets touched. PostgreSQL: INCLUDE (col1, col2) on CREATE INDEX.
Joins: INNER (intersection), LEFT (all from left + matches), RIGHT (avoid; rewrite as LEFT), FULL OUTER (postgres only), CROSS (cartesian). LATERAL: subquery in FROM that can reference columns from preceding FROM items.
Transactions: BEGIN; ... COMMIT; / ROLLBACK. Savepoints for nested.
SQLite: WAL mode allows concurrent readers + 1 writer. journal_mode = WAL. If the volume rejects WAL (NFS/FUSE/read-only), fall back to DELETE.
Postgres: SERIAL = auto-incrementing int. UUID = gen_random_uuid(). Generated columns: GENERATED ALWAYS AS (col_a + col_b) STORED.
Connection pooling: pg's Pool. better-sqlite3 is synchronous (one connection, in-process).
Migrations: idempotent. CREATE TABLE IF NOT EXISTS. ALTER TABLE ADD COLUMN IF NOT EXISTS (pg) or wrap in try/catch (SQLite).
Soft delete: deleted_at TIMESTAMPTZ. WHERE deleted_at IS NULL. Add an index on deleted_at if you query it often.
N+1: a query that returns N rows and then runs N follow-up queries. Detect with EXPLAIN ANALYZE. Fix with a single JOIN, a window function, or a CTE.
EXPLAIN ANALYZE: shows the actual plan with row counts and timing. Look for "Seq Scan" on large tables (should be "Index Scan").`
  },
  {
    id: "py.basics",
    category: "language",
    tags: ["python", "asyncio", "typing", "venv", "poetry"],
    summary: "Python: typing, async/await, packaging, venv, common stdlib",
    body: `Type hints: from typing import Optional, List, Dict, Tuple, Callable. Python 3.10+: int | None, list[int], dict[str, int], tuple[int, ...].
async/await: coroutines defined with async def. Run with asyncio.run(main()). For parallel I/O: asyncio.gather(*coros). For timeouts: async with asyncio.timeout(5):.
Dataclasses: @dataclass(frozen=True) for value objects. @dataclass(slots=True) for memory + speed.
Pattern matching (3.10+): match x: case {"type": "user", "id": uid}: ...
Context managers: implement __enter__ / __exit__ or use @contextmanager. Always use 'with' for file handles, locks, DB connections.
Packaging: pyproject.toml is the modern manifest. Build: python -m build. Publish: twine upload dist/*. Use uv or poetry for dependency management.
Virtualenvs: python -m venv .venv, source .venv/bin/activate. Or uv venv (much faster).
Pip-tools: pip-compile requirements.in -> requirements.txt.
stdlib highlights: pathlib.Path, dataclasses, enum, functools.cache, itertools, contextlib.suppress, logging (with dictConfig), unittest.mock.
Common gotchas: mutable default args (def f(x=[]): ...), late binding closures in loops, is vs == (use is for None/True/False).
GIL: only one thread runs Python at a time. For CPU-bound, use multiprocessing or subprocess. For I/O-bound, threads or asyncio are fine.`
  },
  {
    id: "go.basics",
    category: "language",
    tags: ["go", "goroutine", "channel", "error", "context"],
    summary: "Go: goroutines, channels, error handling, context, stdlib, common patterns",
    body: `Goroutines: go f(). Cheap (2KB stack). Communicate via channels, not shared state.
Channels: ch := make(chan T) (unbuffered), make(chan T, n) (buffered). Sender blocks until receiver reads. Close with close(ch); receivers range over it.
Select: select { case x := <-ch1: ... case ch2 <- y: ... default: ... }. Multiplex on multiple channels.
Errors: return error as the last value. Wrap with fmt.Errorf("opening config: %w", err). Check with errors.Is(err, sql.ErrNoRows).
Context: ctx, cancel := context.WithTimeout(ctx, 5*time.Second). Pass ctx through every I/O call. Cancel triggers cleanup; always defer cancel().
stdlib highlights: net/http (server and client), encoding/json, database/sql (with pq driver), io, os, sync.Mutex, sync.WaitGroup, testing.
HTTP server: http.ListenAndServe(":8080", mux). Middleware: func(h http.Handler) http.Handler.
Defer: runs at function return. LIFO. Use for cleanup: defer f.Close(), defer resp.Body.Close(), defer mu.Unlock().
No exceptions. Use panic for "this can never happen" (programmer error). Use error returns for everything else.
Build tags: //go:build linux && amd64. Use them to compile platform-specific code.
Modules: go mod init, go get, go mod tidy. go.sum is the lockfile.
Testing: *_test.go, func TestX(t *testing.T), table-driven tests. testify is the de-facto assertion lib.`
  },
  {
    id: "rust.basics",
    category: "language",
    tags: ["rust", "ownership", "borrow", "lifetime", "async"],
    summary: "Rust: ownership, borrow checker, lifetimes, async, error handling, common patterns",
    body: `Ownership: every value has exactly one owner. Move on assignment. Functions take ownership by default; borrow with &.
Borrow rules: at any time, either one mutable reference OR any number of immutable references. No aliased mutation.
Lifetimes: 'a, 'b, 'static. Usually inferred. Annotate when the compiler can't figure it out: fn longest<'a>(x: &'a str, y: &'a str) -> &'a str.
String vs &str: String is owned, heap-allocated, mutable. &str is a borrowed slice. Use &str for function parameters; return String when allocating.
Error handling: Result<T, E>. ? operator propagates errors. anyhow::Result<T> for app-level, thiserror for library-level.
panic! for unrecoverable. unwrap() in tests, never in prod.
async/await: tokio runtime. Future is lazy; await polls it. async fn returns impl Future.
Channels: tokio::sync::mpsc for multi-producer single-consumer. mpmc for multi-multi.
Cargo: Cargo.toml for manifest. cargo build, test, clippy, fmt. cargo add serde. Cargo.lock is the lockfile.
Common libs: serde (JSON/YAML/TOML), tokio (async runtime), reqwest (HTTP client), axum (HTTP server), sqlx (DB), tracing (logging), clap (CLI).
Iterators: .iter().map().filter().collect() — chainable, lazy. Prefer iterator chains over explicit for loops.
Pattern matching: match x { Some(v) => ..., None => ... }. if let Some(x) = opt { ... } for single cases.
Traits: derive(Debug, Clone, PartialEq) for value types. Implement Display for user-facing printing. Send + Sync for thread safety.`
  },
  {
    id: "bash.basics",
    category: "language",
    tags: ["bash", "shell", "scripting", "posix"],
    summary: "Bash scripting: quoting, expansions, traps, error handling, common idioms",
    body: `Quote everything: "$var" not $var. Word splitting and globbing will eat you otherwise. Use arrays: arr=("a" "b" "c"); echo "$\{arr[@]}".
[[ ... ]] is the test command (bash only). [ ... ] is the legacy one. Prefer [[.
set -euo pipefail at the top of every script: exit on error, undefined var, pipe failure.
Process substitution: diff <(cmd1) <(cmd2). Read command output as a file.
xargs: build commands from stdin. -n 1 one at a time, -I {} placeholder, -P n parallelism.
find: find . -name '*.ts' -not -path '*/node_modules/*'. Use -print0 / xargs -0 for filenames with spaces.
trap: trap 'rm -f "$tmp"' EXIT. Always clean up tmp files.
mktemp: tmp=$(mktemp -d). Safer than $$ or $RANDOM.
case statement: case "$x" in foo) ...;; *.ts) ...;; esac
read: IFS=: read -r user _ uid _ < /etc/passwd.
subshells: ( cd /tmp && do_stuff ) — the cd doesn't leak out.
Heredoc: cat <<'EOF' > file (single-quoted EOF disables expansion).
Useful one-liners:
  ps aux | grep -v grep | grep node
  find . -name '*.log' -mtime +30 -delete
  du -sh */ | sort -hr | head
  jq -r '.items[] | .name' file.json
  rg -n 'TODO' --type ts
Common gotchas: spaces in filenames, CRLF line endings (run dos2unix), set -e doesn't catch && chains, exit code of a pipe is the last command (use \$\{PIPESTATUS[0\]\} for the first).`
  },
  {
    id: "regexp.cheatsheet",
    category: "language",
    tags: ["regex", "regexp", "pattern", "match"],
    summary: "Regular expressions: anchors, character classes, quantifiers, groups, lookarounds, common idioms",
    body: `Anchors: ^ (start), $ (end), \\b (word boundary), \\B (non-boundary).
Character classes: . (any char except newline), \\d \\w \\s (and \\D \\W \\S for negation), [abc] (one of), [^abc] (not), [a-z] (range).
Quantifiers: * (0+), + (1+), ? (0 or 1), {n} {n,} {n,m}. Lazy: append ?, e.g. .*? . Non-greedy matches as little as possible.
Groups: (abc) capture. (?:abc) non-capture. (?<name>abc) named. \\1 / \\k<name> backreference.
Lookarounds: (?=abc) lookahead, (?!abc) negative lookahead, (?<=abc) lookbehind, (?<!abc) negative lookbehind. No variable-width lookbehind in JS / Python <3.7.
Alternation: (foo|bar) — try longest first if ambiguous.
Flags: /.../i case-insensitive, /.../g global, /.../m multiline (^/$ match per-line), /.../s dotall (. matches newline).
Escapes: \\. \\\\ \\( \\) \\[ \\] \\{ \\} \\| \\^ \\$ \\+ \\* \\? \\/ \\\\\\\\.
Common idioms:
  email: [\\w.+-]+@[\\w-]+\\.[\\w.-]+
  URL:   https?://[^\\s]+
  IPv4:  \\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b
  UUID:  [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
Performance: avoid catastrophic backtracking (nested quantifiers on overlapping sets: (a+)+ against "aaaaaaaaaaa!" will explode). Use possessive quantifiers where supported, or rewrite with non-overlapping classes.
JS-specific: lookbehind landed in V8 6.2 (2018). Named groups in modern browsers. /u for unicode, /y sticky.
Python: re.compile() once and reuse. re.VERBOSE for readable patterns. (?P<name>...) for named groups.`
  },
  {
    id: "graphql.basics",
    category: "language",
    tags: ["graphql", "schema", "resolver", "query", "mutation"],
    summary: "GraphQL: schema, resolvers, N+1, dataloader, federation, common pitfalls",
    body: `Schema-first: define SDL first, then implement resolvers. SDL is the contract.
Types: scalar (Int, Float, String, Boolean, ID), object (type User { id: ID! name: String! }), interface, union, enum, input (for mutations).
! means non-null. [User!]! = list of non-null users, the list itself non-null. [] = nullable list of nullable users.
Query: read. Mutation: write. Subscription: realtime over websocket.
Resolvers: (parent, args, ctx, info) => ... . Default resolver walks the field name. Override when you need a join or a compute.
N+1: parent returns N items, child resolver runs N times. Fix with DataLoader: batch + cache per request.
ctx: pass auth, db pool, request id, dataloader registry here. Build once per request, not per resolver.
Errors: throw a GraphQLError with extensions.code = "UNAUTHORIZED" / "NOT_FOUND" / "RATE_LIMITED". Don't return null silently — the client can't distinguish "not found" from "bug".
Pagination: cursor-based (preferred). opaque cursor = base64({lastId, ts}). Relay spec: first/after, last/before. Avoid offset (slow on large tables).
Federation: Apollo Federation, GraphQL Federation by The Guild. Subgraphs own their types; gateway stitches them. @key, @requires, @provides, @external directives.
Persisted queries: APQ. Client sends a hash; server resolves. Cuts bandwidth + enables allowlisting.
Subscriptions: graphql-ws protocol (not the legacy subscriptions-transport-ws). One websocket per client; multiplex subscriptions on it.
Security: depth limiting, query complexity, disable introspection in prod, max aliases, max directives. graphql-shield or GraphQL Armor.
Performance: persisted queries, dataloader everywhere, scalar serialization (avoid json objects in resolver return), fragments for shared selection sets.`
  }
];

// ─── Frameworks ─────────────────────────────────────────────────────
const FRAMEWORKS: DevSkill[] = [
  {
    id: "next.app-router",
    category: "framework",
    tags: ["next.js", "app router", "rsc", "data fetching", "caching"],
    summary: "Next.js App Router data fetching: server components, fetch caching, revalidation, parallel + sequential",
    body: `Server components can await directly:
  export default async function Page() {
    const posts = await db.posts.findMany();
    return <List posts={posts} />;
  }
fetch() is cached by default in App Router. opt out with {cache:'no-store'}. Time-based: {next:{revalidate:60}}. Tag-based: fetch(...,{next:{tags:['post:123']}}); revalidateTag('post:123') from a server action.
Sequential vs parallel:
  // sequential (slow):
  const a = await getA(); const b = await getB();
  // parallel (fast):
  const [a,b] = await Promise.all([getA(), getB()]);
Streaming with Suspense:
  <Suspense fallback={<Skeleton/>}>
    <SlowPanel/>
  </Suspense>
Loading.tsx: the convention for a route's loading state. The router shows it immediately while the page streams in.
Error boundary: error.tsx with "use client" wraps the route segment.
Not found: not-found.tsx.
Dynamic rendering: any await to a dynamic source (cookies(), headers(), searchParams) opts the route out of static caching. Use it deliberately.
generateStaticParams: pre-build a set of dynamic routes at build time.
Route handlers (app/api/foo/route.ts):
  export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
    return NextResponse.json({...}, { headers: { 'cache-control': 'no-store' } });
  }
  export async function POST(req: NextRequest) {
    const body = await req.json();
    return NextResponse.json({ ok: true }, { status: 201 });
  }
Middleware (middleware.ts at project root): runs on every request. Use for auth, redirects, geo, A/B.
  export function middleware(req: NextRequest) {
    if (req.nextUrl.pathname.startsWith('/admin') && !req.cookies.get('admin')) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return NextResponse.next();
  }
  export const config = { matcher: ['/admin/:path*'] };`
  },
  {
    id: "next.config",
    category: "framework",
    tags: ["next.js", "next.config", "env", "redirects", "headers", "rewrite"],
    summary: "next.config.ts: redirects, headers, rewrites, env vars, image domains, standalone output",
    body: `next.config.ts (or .js / .mjs):
  const cfg: NextConfig = {
    output: 'standalone',                  // smaller Docker image
    reactStrictMode: true,
    poweredByHeader: false,
    async redirects() {
      return [{ source: '/old', destination: '/new', permanent: true }];
    },
    async headers() {
      return [{ source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }];
    },
    async rewrites() {
      return [{ source: '/api/proxy/:path*', destination: 'https://upstream.example/:path*' }];
    },
    images: {
      domains: ['cdn.example.com'],
      formats: ['image/avif', 'image/webp'],
      remotePatterns: [{ protocol: 'https', hostname: '**' }],
    },
    experimental: { serverActions: { bodySizeLimit: '5mb' } },
  };
Env vars: NEXT_PUBLIC_* is inlined into the client bundle. Everything else is server-only. Read server envs lazily inside functions, not at module top, so build doesn't fail when a key is missing.
Standalone output: next build produces .next/standalone with a minimal node_modules. Copy .next/static and public/ into the standalone dir.
serverExternalPackages: ['better-sqlite3', 'sharp', '@sentry/node']. Packages that should NOT be bundled.`
  },
  {
    id: "react.testing",
    category: "framework",
    tags: ["react", "testing", "vitest", "rtl", "playwright"],
    summary: "React testing: Vitest, React Testing Library, Playwright — what to test at which layer",
    body: `Unit: pure functions, hooks, utilities. Vitest + @testing-library/react-hooks. Fast, no DOM if avoidable.
Component: render the component, assert on the rendered output. React Testing Library (RTL): screen.getByRole, getByText, getByLabelText. Query by what the user sees, not by className.
Integration: render a full feature with its providers. MSW (Mock Service Worker) for network. Or a real test DB if you're fast.
E2E: Playwright or Cypress. Drive a real browser. Slowest; reserve for the critical paths (sign-in, checkout, primary CTA).
Coverage: not a quality metric. Look for uncovered branches, not uncovered lines.
Mocking: vi.mock() at the top. Don't mock the thing you're testing.
Render hooks with renderHook: const {result} = renderHook(() => useCounter()); act(() => result.current.inc());
Async: findBy* queries retry; waitFor(() => expect(...).toBeInTheDocument()).
Common gotcha: testing implementation details (state, internal method calls). Test behavior (the user-visible effect).`
  },
  {
    id: "express.basics",
    category: "framework",
    tags: ["express", "node", "http", "middleware", "routing"],
    summary: "Express: middleware, error handling, async, security",
    body: `const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: ['https://app.example.com'], credentials: true }));
app.use((req, res, next) => { req.id = crypto.randomUUID(); next(); });
app.get('/api/users/:id', async (req, res, next) => {
  try { const user = await db.users.find(req.params.id); res.json(user); }
  catch (e) { next(e); }
});
// 4-arg error handler — must have exactly 4 args for Express to recognize it.
app.use((err, req, res, next) => {
  console.error({ id: req.id, err });
  res.status(err.status || 500).json({ error: { id: req.id, message: err.message } });
});
app.listen(3000);
Async errors: Express 4 doesn't catch rejected promises automatically. Wrap with try/catch + next(e), or use express-async-errors to monkey-patch, or move to Express 5 (which handles them).
Security: helmet, cors with explicit origins, rate-limit (express-rate-limit), csurf if cookies, parameterized SQL, never trust req.body.
Streaming: res.write(chunk); res.end(); or pipe a stream with res.
Clustering: Node is single-threaded. For multi-core, use the cluster module or pm2 in cluster mode. Or run N containers behind a load balancer.`
  },
  {
    id: "fastapi.basics",
    category: "framework",
    tags: ["fastapi", "python", "pydantic", "async"],
    summary: "FastAPI: async routes, Pydantic models, dependency injection, OpenAPI",
    body: `from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
app = FastAPI()
class UserIn(BaseModel):
  name: str
  email: str
class UserOut(UserIn):
  id: int
@app.post('/users', response_model=UserOut)
async def create_user(u: UserIn, db = Depends(get_db)):
  row = await db.execute("INSERT INTO users(name,email) VALUES($1,$2) RETURNING id", u.name, u.email)
  return UserOut(id=row['id'], **u.dict())
@app.get('/users/{uid}', response_model=UserOut)
async def get_user(uid: int, db = Depends(get_db)):
  row = await db.fetchrow("SELECT * FROM users WHERE id=$1", uid)
  if not row: raise HTTPException(status_code=404, detail='not found')
  return dict(row)
Pydantic v2: model_config = ConfigDict(from_attributes=True) for ORM mode. Field() for validation. validator/@field_validator for custom.
Dependencies: anything injectable. Yields for setup/teardown. Use Annotated[Db, Depends(get_db)] for type clarity.
Background tasks: BackgroundTasks. For real work, use Celery / Arq / Dramatiq.
Auth: OAuth2PasswordBearer + jwt. Dependency returns the current user; routes take it.
OpenAPI: /docs (Swagger UI), /redoc. Free. Customize with tags, responses, examples.
Performance: uvicorn --workers 4 (multi-process) or --workers 1 --loop uvloop. Async DB drivers (asyncpg, aiomysql) for non-blocking queries.`
  },
  {
    id: "docker.basics",
    category: "framework",
    tags: ["docker", "container", "dockerfile", "compose"],
    summary: "Docker: Dockerfile patterns, multi-stage builds, layer caching, compose",
    body: `Multi-stage build keeps the image small:
  FROM node:22-alpine AS deps
  WORKDIR /app
  COPY package.json package-lock.json ./
  RUN npm ci
  FROM node:22-alpine AS build
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  RUN npm run build
  FROM node:22-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=build /app/.next/standalone ./
  COPY --from=build /app/.next/static ./.next/static
  COPY --from=build /app/public ./public
  EXPOSE 3000
  USER node
  CMD ["node", "server.js"]
Layer caching: COPY package.json before COPY . . so the dependency layer caches across source changes.
.dockerignore: same as .gitignore but for the build context. Exclude node_modules, .next, .git, .env, etc.
Multi-arch: --platform linux/amd64,linux/arm64 in FROM or use buildx.
Compose:
  services:
    api:
      build: .
      ports: ["3000:3000"]
      env_file: .env
      depends_on: [db]
      restart: unless-stopped
    db:
      image: postgres:16-alpine
      environment:
        POSTGRES_PASSWORD: ...
      volumes: ["pgdata:/var/lib/postgresql/data"]
  volumes:
    pgdata:
Healthcheck: HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1. Docker will restart unhealthy containers.`
  },
  {
    id: "nginx.basics",
    category: "framework",
    tags: ["nginx", "reverse-proxy", "tls", "rate-limit"],
    summary: "nginx: reverse proxy, TLS termination, rate limiting, gzip, caching",
    body: `server {
  listen 80;
  server_name app.example.com;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2;
  server_name app.example.com;
  ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  add_header Strict-Transport-Security "max-age=31536000" always;
  gzip on;
  gzip_types text/plain text/css application/json application/javascript;
  client_max_body_size 25m;
  location / {
    proxy_pass http://app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
  location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://app:3000;
  }
}
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
Rate limit per IP. Combine with fail2ban for abusive clients.
Caching: proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=cache:10m; location /static { proxy_cache cache; proxy_cache_valid 200 1d; }
Logs: access_log /var/log/nginx/access.log; error_log /var/log/nginx/error.log; log_format with $request_id for tracing.`
  }
];

// ─── Infra ──────────────────────────────────────────────────────────
const INFRA: DevSkill[] = [
  {
    id: "docker.compose",
    category: "infra",
    tags: ["docker", "compose", "networking", "volumes"],
    summary: "Docker Compose: services, networks, volumes, healthchecks, env files",
    body: `services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://app:secret@db:5432/app
    depends_on:
      db:
        condition: service_healthy
    networks: [appnet]
    restart: unless-stopped
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks: [appnet]
networks:
  appnet:
volumes:
  pgdata:
Networks: services on the same compose network can address each other by service name. Default driver is bridge.
.env file: KEY=value lines. Compose substitutes \${KEY} in the file.
Profiles: profiles: [dev] — only run with --profile dev.
Override file: docker-compose.override.yml for local dev.`
  },
  {
    id: "postgres.ops",
    category: "infra",
    tags: ["postgres", "ops", "vacuum", "wal", "replication"],
    summary: "Postgres operations: WAL, autovacuum, replication, connection pooling, monitoring",
    body: `WAL (write-ahead log): every change is appended to WAL before being applied. On crash, replay WAL to recover. archive_mode = on ships WAL to S3 for PITR.
autovacuum: reclaims dead tuples. Track: SELECT relname, n_dead_tup, last_autovacuum FROM pg_stat_user_tables; If n_dead_tup stays high, tune: autovacuum_vacuum_scale_factor = 0.05 (vacuum at 5% dead, not 20%).
Replication: streaming (default), logical (for CDC). Patroni + etcd for HA. pgBackRest for backups.
Connection pooling: pgbouncer in transaction mode. Postgres has a per-process limit (~100 connections); pgbouncer fronts thousands of clients with a small backend pool.
Lock monitoring: SELECT * FROM pg_locks WHERE NOT GRANTED; — long waits mean contention.
Slow query: log_min_duration_statement = 1000 (1s). pg_stat_statements for aggregate stats.
Index bloat: pgstattuple. Reindex CONCURRENTLY (no lock).
EXPLAIN ANALYZE: see the actual plan. Look for Seq Scan on large tables.
pg_dump for logical backups. pg_basebackup for physical.
High availability: synchronous replication (RPO=0, slower), asynchronous (eventual RPO). Choose by durability vs latency budget.`
  },
  {
    id: "sqlite.ops",
    category: "infra",
    tags: ["sqlite", "wal", "performance", "backup"],
    summary: "SQLite ops: WAL mode, backup, performance tuning, when to use it",
    body: `WAL mode: PRAGMA journal_mode=WAL. Concurrent readers + 1 writer. Faster for most workloads. Requires a shared-memory file (-shm) and a WAL file (-wal) alongside the main DB.
synchronous = NORMAL is the right balance; FULL is the safest but slowest; OFF is the fastest but corruptible on power loss.
Backup: SQLite's built-in backup API (online, safe). Or sqlite3 db.sqlite .backup dst.sqlite.
PRAGMA foreign_keys = ON. SQLite parses but ignores FKs by default.
PRAGMA temp_store = MEMORY. PRAGMA cache_size = -64000 (64MB).
Avoid: many small writes (use transactions), full-table UPDATEs (chunk them), running on NFS (lock issues — copy to local first).
When to use: embedded, mobile, single-server edge, small-to-medium web apps (< 100K writes/sec). When NOT to use: multi-server writes, > 1TB, real-time replication.
better-sqlite3: synchronous, in-process, very fast. Pair with a write queue if you have multiple Node processes.`
  },
  {
    id: "redis.usage",
    category: "infra",
    tags: ["redis", "cache", "pubsub", "streams", "rate-limit"],
    summary: "Redis: data structures, pub/sub, streams, rate limiting, locks, caching",
    body: `Strings: GET/SET/INCR. EXPIRE for TTL. SET key value EX 60 NX for "set if not exists with 60s TTL" — classic distributed lock primitive.
Hashes: HSET/HGET/HMSET/HMGET. HINCRBY for counters. HGETALL for full state.
Lists: LPUSH/RPUSH/LPOP/RPOP. BLPOP for blocking queue.
Sets: SADD/SREM/SMEMBERS. SINTER for intersection.
Sorted sets: ZADD/ZRANGE/ZRANK. Use for leaderboards, rate limit sliding windows.
Streams: XADD/XREAD/XREADGROUP. Append-only log; consumer groups for parallel processing.
Pub/Sub: PUBLISH/SUBSCRIBE. Fire-and-forget. For reliable delivery, use Streams.
Rate limiting: INCR + EXPIRE pattern. Or sliding window with ZADD + ZREMRANGEBYSCORE.
Distributed lock: SET key value NX EX 30. Release with a Lua script that checks the value first (so a delayed client doesn't release a lock another acquired).
Caching: layer between your app and the DB. Always have a TTL. Invalidate on write, not just on read.
Memory: maxmemory-policy allkeys-lru for a pure cache; noeviction for a data store.`
  },
  {
    id: "tls.basics",
    category: "infra",
    tags: ["tls", "https", "certbot", "letsencrypt", "mtls"],
    summary: "TLS / HTTPS: certs, Let's Encrypt, HSTS, mTLS, common pitfalls",
    body: `Let's Encrypt: certbot certonly --nginx -d app.example.com (or --webroot for non-nginx). Auto-renew: certbot renew --dry-run, then a cron or systemd timer.
HTTP-01 challenge: requires port 80 reachable from the internet. DNS-01 challenge: requires API access to your DNS provider; works for wildcards.
HSTS: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload. Once you ship HSTS, you can't easily roll back to HTTP.
TLS versions: TLSv1.2 + TLSv1.3 only. Disable TLS 1.0/1.1. sslscan or testssl.sh to verify.
Cipher suites: HIGH:!aNULL:!MD5:!RC4:!3DES. Or use the Mozilla SSL config generator.
mTLS: client presents a cert signed by a CA you trust. Mutual auth. Use for service-to-service in zero-trust networks. nginx: ssl_client_certificate /path/to/ca.pem; ssl_verify_client on;
Common pitfall: cert chain incomplete — server cert + intermediate cert in the chain file, root last (or just the leaf + intermediate; client usually has the root).
SNI: one IP, many domains. nginx handles it transparently; just have a server block per server_name.
Key sizes: RSA 2048 minimum (4096 if paranoid), ECDSA P-256/P-384 preferred for new certs.`
  },
  {
    id: "oauth2.basics",
    category: "infra",
    tags: ["oauth2", "oidc", "pkce", "jwt", "auth"],
    summary: "OAuth 2.0 / OIDC: authorization code + PKCE, token storage, refresh, logout, common pitfalls",
    body: `Flows:
  - Authorization Code + PKCE: the default for SPAs and mobile. Client generates a code_verifier + code_challenge, sends challenge to /authorize, exchanges the code + verifier for tokens.
  - Client Credentials: server-to-server. No user.
  - Implicit: deprecated. Don't use.
  - Resource Owner Password: deprecated.
OIDC = OAuth 2.0 + a /userinfo endpoint and an ID token (JWT).
Token storage: never in localStorage (XSS stealable). Use httpOnly secure cookies with SameSite=Lax (or Strict for pure first-party).
Refresh: short-lived access token (5-15 min), long-lived refresh token (days-months). Rotate the refresh token on use. Store the new one; invalidate the old.
State parameter: prevents CSRF. Random per request, stored in session, verified on callback.
Logout: front-channel (redirect to /logout) and back-channel (POST to /revoke). Local logout: clear cookies. Global logout: also invalidate the refresh token.
Common pitfalls: open redirect (validate the redirect_uri against an allowlist), token leakage via Referer (use Referrer-Policy: no-referrer for token-bearing responses), missing audience claim (the access token's aud must match YOUR api).
JWT: header.payload.signature. Verify with the IdP's JWKS, not a hardcoded secret. Check exp, iss, aud, nbf.`
  },
  {
    id: "monitor.basics",
    category: "infra",
    tags: ["monitoring", "prometheus", "grafana", "alerting", "slo"],
    summary: "Monitoring: Prometheus, Grafana, the four golden signals, SLOs, alerting",
    body: `The four golden signals (Google SRE): latency, traffic, errors, saturation. Add: business KPIs (signups/min, revenue/min).
RED method (for services): Rate, Errors, Duration.
USE method (for resources): Utilization, Saturation, Errors.
Prometheus: pull-based metrics. /metrics endpoint in your service. PromQL: rate(http_requests_total[5m]), histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))).
SLO: e.g. 99% of requests succeed in < 200ms over 30 days. The error budget: 1% of 30d * total_requests.
Alerting: alert on symptoms (SLO burn rate), not causes. Page when the burn rate would exhaust the budget in < 1h (fast burn) or < 6h (slow burn).
Grafana: dashboards on top of Prometheus. Annotate deploys so you can correlate latency spikes with releases.
Tracing: OpenTelemetry. Trace context propagates via traceparent header. Backend: Tempo, Jaeger, Honeycomb, Datadog.
Logs: structured (JSON). Include request id, trace id, user id (if known). Ship to Loki, Elasticsearch, or a SaaS.
Cardinality: be careful with high-cardinality labels (user_id, request_id). They explode the TSDB.`
  }
];

// ─── Patterns ───────────────────────────────────────────────────────
const PATTERNS: DevSkill[] = [
  {
    id: "auth.session",
    category: "pattern",
    tags: ["auth", "session", "cookie", "csrf", "xss"],
    summary: "Session cookies: secure, httpOnly, SameSite; CSRF tokens; rotating session IDs",
    body: `Cookie config:
  Set-Cookie: session=...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=...
HttpOnly: blocks JS from reading (mitigates XSS-driven session theft).
Secure: only sent over HTTPS.
SameSite=Lax: blocks third-party CSRF for top-level navigations. SameSite=Strict is stricter but breaks links from external sites into your app. SameSite=None requires Secure.
Path: scope. Path=/ for app-wide, Path=/api for API-only.
Rotate on auth: when an anonymous user logs in, mint a NEW session id. Otherwise session fixation: the attacker's pre-login cookie becomes the user's post-login cookie.
CSRF: server-rendered forms need a per-session token validated on submit. SPA + Bearer header: not vulnerable to CSRF because the browser doesn't auto-attach the bearer.
Token storage: in-memory + refresh token in httpOnly cookie. Never in localStorage.
Session timeout: idle (15-30 min) and absolute (8-24h). Renew sliding window.
Logout: server-side revocation (delete session row) + clear cookie. For multi-device logout, store a session_epoch per user and reject tokens with a lower epoch.`
  },
  {
    id: "auth.api",
    category: "pattern",
    tags: ["auth", "api", "bearer", "scope", "rbac"],
    summary: "API auth: Bearer tokens, scopes, RBAC, rate limiting, audit logging",
    body: `Bearer token in Authorization: Bearer <token>. Or cookie for same-origin. Or mTLS for service-to-service.
Scopes: token has {read:posts, write:posts, admin:users}. Check scope before action: if (!token.scopes.includes('write:posts')) return 403.
RBAC vs ABAC: role-based (admin/editor/viewer) is simpler. Attribute-based (user.department === resource.department AND time.within(sla)) is more flexible but harder to reason about. Mix: coarse roles for navigation, fine-grained checks for actions.
Audit log: who did what, when, to which resource. Append-only. Include before/after state for mutations. Ship to a separate store (not the primary DB) so an attacker who compromises the app can't also wipe the audit trail.
Rate limit per token AND per IP: 1000 req/min per token, 100 req/min per IP. Different limits for different endpoints (10/min for /login, 100/min for /api).
Idempotency: accept an Idempotency-Key header on POST. Store the key with the response. If the client retries with the same key, return the stored response. Critical for payments.
Webhook verification: provider sends a signature in a header; verify with HMAC-SHA256 of the body using a per-source secret. Reject if the signature is missing, wrong, or replayed (timestamp window of 5 min).
Versioning: /api/v1/, /api/v2/. Or a header (Accept: application/vnd.myapi.v2+json). Path-based is more discoverable.`
  },
  {
    id: "data.migration",
    category: "pattern",
    tags: ["migration", "schema", "expand-contract", "zero-downtime"],
    summary: "Schema migrations: expand-contract for zero-downtime, idempotent scripts, rollback plans",
    body: `Expand-contract: never break the running app during a deploy.
  1. EXPAND: add the new column/table/index. App still uses the old one. Deploy.
  2. MIGRATE: backfill the new column from the old. Run as a one-shot script, not part of the deploy. Track progress; resume on crash.
  3. CONTRACT: switch the app to read/write the new column. Deploy.
  4. CLEANUP: drop the old column in a later release. Don't rush.
Migrations are forward-only. Every migration has a corresponding rollback documented in the commit message, but the rollback is rarely run.
Idempotency: every migration step runs cleanly if applied twice. CREATE TABLE IF NOT EXISTS. INSERT ... ON CONFLICT DO NOTHING.
Long migrations: lock-free where possible. Postgres: ALTER TABLE ADD COLUMN with a default rewrites the whole table in 9.5+ (was instant in 11+). For big tables, do it in chunks.
Locks: ALTER TABLE takes an ACCESS EXCLUSIVE lock. Schedule during low traffic or use pt-online-schema-change / pgroll / strong_migrations gem (Rails) for online rewrites.
Versioning: a migrations table (schema_migrations) tracks which files have run. Each migration is a single file with an up function (and a down for parity, even if unused).
Testing: every migration runs against a copy of prod data in CI. Migrations that pass unit tests but fail on prod-scale data are the most common deploy-day incident.`
  },
  {
    id: "cache.invalidation",
    category: "pattern",
    tags: ["cache", "invalidation", "ttl", "stale-while-revalidate"],
    summary: "Cache invalidation strategies: TTL, write-through, write-behind, tag-based, stale-while-revalidate",
    body: `TTL: simplest. Set a max-age. Acceptable staleness window.
  redis.set('user:123', JSON.stringify(user), 'EX', 300);
Write-through: app updates the DB and the cache in the same call. Strong consistency, slower writes.
Write-behind: app updates the cache; a worker flushes to the DB later. Faster writes, risk of data loss on crash.
Cache-aside (lazy): app checks the cache, misses, reads DB, populates cache. On write, app updates DB and invalidates the cache (delete, not set — to avoid races).
Tag-based: cache key includes tags; invalidation by tag deletes every entry with that tag. Redis: keep a set per tag, SADD tag key; SREM tag key1 key2 ... on invalidation.
Stale-while-revalidate: serve the stale value while a background job refetches. Browser HTTP cache does this natively (Cache-Control: max-age=60, stale-while-revalidate=600).
Negative caching: cache the "not found" for a short TTL to prevent repeated misses from hammering the DB.
Thundering herd: 1000 concurrent misses all hit the DB. Use a single-flight pattern: only one process fetches, others wait on the same Promise.
Stampede protection: add jitter to TTLs so they don't all expire at once.
Locking: distributed lock around the "fill the cache" step. SET key lock NX EX 5; if it returns OK, you're the filler; otherwise wait + retry.`
  },
  {
    id: "ratelimit",
    category: "pattern",
    tags: ["rate-limit", "token-bucket", "sliding-window", "leaky-bucket"],
    summary: "Rate limiting: token bucket, sliding window, leaky bucket — at which layer",
    body: `Token bucket: each client has a bucket of N tokens, refilled at R per second. A request consumes 1 token; if empty, reject. Bursty.
Sliding window: count requests in the last N seconds. Approximated with two fixed windows: current + previous, weighted by overlap.
Leaky bucket: requests enter a queue, processed at a fixed rate. Smooth output, no bursts.
Fixed window: simplest. Count requests per second. Bursty at window boundaries (2x peak at the edge).
At which layer: defense in depth.
  1. Edge (CDN / WAF): coarse limits per IP, against volumetric attacks.
  2. Load balancer / reverse proxy: per-IP + per-token at the edge.
  3. Application: per-user, per-endpoint, per-API-key. Slow path; can't enforce fairness across multiple instances without a shared store.
  4. Database: connection pool limits + per-user query budget.
Response: 429 Too Many Requests. Headers: Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset.
Backoff: client should back off exponentially on 429. Server can return Retry-After: 5.
Implementation: Redis is the standard shared store. Lua script for atomic check+increment.`
  },
  {
    id: "idempotency",
    category: "pattern",
    tags: ["idempotency", "retry", "api", "webhook", "payment"],
    summary: "Idempotency: keying POSTs, dedup window, server-side response storage, payment safety",
    body: `Problem: a network blip causes the client to retry a POST. The server processes it twice. The user is charged twice.
Solution: the client sends an Idempotency-Key header (UUID). The server stores the key + the response for a dedup window (24h is standard). If the same key arrives again, return the stored response without re-processing.
Format: the key is opaque to the server. The server just stores and matches.
Storage: any KV. Redis with SETNX + EX 86400. Or a table: idempotency_keys(key PRIMARY KEY, response_body, status, created_at).
Race: two requests with the same key arrive at the same time. Use a row-level lock: INSERT INTO idempotency_keys ... ON CONFLICT DO NOTHING RETURNING ...; if no row returned, look up the existing key and return its response.
TTL: long enough that all reasonable retries complete (24h typical). Short enough that storage doesn't grow unbounded.
Scope: per-endpoint AND per-user. Same key for different users is a different request.
Payments: Stripe's idempotency model. Always send an Idempotency-Key for any state-changing call. Stripe returns the same result on retry.
Webhooks: verify the signature, store the event id, process once. Don't trust the sender to not retry.`
  },
  {
    id: "errors",
    category: "pattern",
    tags: ["errors", "logging", "correlation-id", "structured"],
    summary: "Error handling: typed errors, structured logging, correlation IDs, never swallow",
    body: `Typed errors: class AppError extends Error { code: string; statusCode: number; constructor(msg, code, statusCode) { super(msg); this.code=code; this.statusCode=statusCode; } }. Throw AppError; catch in the route handler and turn it into a Response.
Don't swallow. catch (e) { /* TODO */ } is a bug factory. If you really don't care, log it and move on.
Structured logging: { ts, level, msg, requestId, userId, route, status, latencyMs, err } — one line per log, JSON, parseable.
Correlation ID: every request gets a uuid (request id). All logs for that request include it. The browser sees it in the X-Request-Id response header; support can ask the user for it.
Levels: ERROR (something is wrong, page someone), WARN (something is off, log it), INFO (high-level state changes), DEBUG (verbose). Never log at INFO in production.
PII: never log passwords, tokens, full credit-card numbers, SSNs. Redact: log { email: maskEmail(user.email) } not the raw email.
Stack traces: in error logs, full stack. In info logs, just the message.
Sentry/Datadog: send errors with the correlation id; the dashboard groups by stack and frequency.
Bubbling: throw at the deepest level; catch at the level that can do something about it (usually the route handler). The mid-layers just let it pass.`
  },
  {
    id: "testing.trophy",
    category: "pattern",
    tags: ["testing", "unit", "integration", "e2e", "static-analysis"],
    summary: "The Testing Trophy: static + unit + integration + e2e — where to invest",
    body: `Static analysis: types (TypeScript, mypy), linters (eslint, ruff), formatters (prettier, black), dependency scanners (npm audit, snyk, dependabot). Cheap. Catch whole categories of bug. Always invest.
Unit tests: pure functions, utilities, hooks. Fast. Most coverage should be here. Mock sparingly.
Integration tests: a few real components stitched together. DB + API + one service. A small but real test database. Slower but high signal.
E2E tests: the whole app, one or two critical paths. Slow, flaky-prone. Use for the highest-stakes journeys (sign-up, checkout, primary feature).
The pyramid (old): lots of unit, some integration, few e2e.
The trophy (new, Kent C. Dodds): static > integration > unit > e2e. Integration is the sweet spot — most bug-finds per minute spent.
Coverage: track it, but don't gate on a number. A line of integration-tested code is worth more than ten lines of unit-tested.
Determinism: never read system time directly in a test. Pass a clock. Never read env directly — inject. Never use Math.random — pass a seed. The test should produce the same output on every run, on every machine.
Test naming: "given X, when Y, then Z" or "X returns Y when Z" (the spec is the test name). The failure message should explain what broke without opening the test.
CI: every PR runs static + unit + integration. e2e on merge to main. Failed tests block deploy.`
  },
  {
    id: "security.basics",
    category: "pattern",
    tags: ["security", "owasp", "xss", "sqli", "csrf", "ssrf"],
    summary: "App security: OWASP top 10, XSS, SQLi, CSRF, SSRF, secret management, supply chain",
    body: `OWASP Top 10 (2021): broken access control, cryptographic failures, injection (SQLi, XSS, command), insecure design, security misconfig, vulnerable components, auth failures, software/data integrity failures, logging failures, SSRF.
XSS: never render untrusted HTML. React escapes by default; if you must use dangerouslySetInnerHTML, sanitize first (DOMPurify). Use a CSP: Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...';.
SQLi: parameterize. Every query. No exceptions. ORMs are good defaults; raw SQL needs care.
CSRF: see auth.session skill. Per-session token, validated on submit.
SSRF: when fetching a URL the user supplied, block private IP ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7). Resolve the hostname; if it points to a private IP, reject. Then make the request. Use a deny-list or a per-process network policy.
Secrets: never in source. Never in env files committed to git. Use a secret manager (Doppler, AWS Secrets Manager, Vault, 1Password). Rotate on leak. Different secrets per environment.
Dependency security: npm audit, snyk, dependabot, renovate. Patch high/critical within 24h. Pin versions (no ^); use lockfiles; vet your transitive deps.
Headers: HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera=(), microphone=(), geolocation=().
Audit: every action that changes state writes an audit row. Tamper-evident (append-only, signed). Review regularly.`
  },
  {
    id: "api.design",
    category: "pattern",
    tags: ["api", "rest", "design", "versioning", "pagination"],
    summary: "REST API design: resource modeling, HTTP semantics, versioning, pagination, error shape",
    body: `Resource modeling: a noun, not a verb. /api/users, /api/users/123, /api/users/123/posts. Sub-resources for relationships: /api/users/123/orders.
HTTP semantics:
  GET: read, idempotent, cacheable. Body is empty.
  POST: create. 201 Created with Location header pointing to the new resource. Returns the resource.
  PUT: replace the whole resource. Idempotent. 200 with the resource, or 204.
  PATCH: partial update. 200 with the resource, or 204.
  DELETE: delete. 204 No Content (or 200 with the resource).
  HEAD: same as GET but no body. For checking existence.
Status codes: 200 OK, 201 Created, 204 No Content, 301 Moved Permanently, 304 Not Modified, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 410 Gone, 422 Unprocessable Entity, 429 Too Many Requests, 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout.
Error shape: { error: { code: 'RESOURCE_NOT_FOUND', message: '...', details: {...}, requestId: '...' } }. Stable code, human message, machine-parseable details, correlation id.
Versioning: /api/v1/. Or a header. Path is more discoverable.
Pagination: cursor-based. ?first=20&after=cursor. Limit the maximum page size. Return the next cursor.
Filtering: ?status=active&created_after=2024-01-01. Whitelist the filterable fields; reject anything else (don't pass unknown filters to the DB).
Sorting: ?sort=-created_at. Whitelist the sortable fields. Multi-sort: ?sort=-priority,created_at.
Field selection: ?fields=id,name,email. Saves bandwidth. Useful for mobile.
Bulk: POST /api/users/bulk with an array. Or async: POST /api/imports -> 202 with a job id, GET /api/imports/{id} for status.
HATEOAS: include _links in the response. The next page cursor, related resources, etc. Often skipped; cursor in headers is enough.
OpenAPI: write the spec, generate the docs and the client SDKs. Validate requests against the spec in CI.`
  }
];

export const DEV_SKILLS: DevSkill[] = [
  ...LANGUAGES,
  ...FRAMEWORKS,
  ...INFRA,
  ...PATTERNS
];

const SKILL_BY_ID = new Map(DEV_SKILLS.map((s) => [s.id, s] as const));

/**
 * Grep the dev-skills corpus by free-text query. Returns the top N
 * records ranked by:
 *   1. category match (if the operator asks for "language", prefer
 *      language records; ditto framework/infra/pattern)
 *   2. tag overlap with the query
 *   3. summary / body keyword hits
 * This is intentionally a tiny in-process search, not a vector DB —
 * the corpus is small enough that brute-force substring matching
 * beats a real embedding lookup on latency and operational cost.
 * For larger corpora swap in sqlite-vec / pgvector / a real
 * embedding service.
 */
export function searchDevSkills(query: string, opts: { category?: DevSkill["category"]; limit?: number } = {}): DevSkill[] {
  const limit = Math.max(1, Math.min(20, opts.limit ?? 6));
  const q = query.toLowerCase().trim();
  if (!q) {
    // No query — return the top of the requested category, or the whole
    // catalog, in declared order.
    const filtered = opts.category ? DEV_SKILLS.filter((s) => s.category === opts.category) : DEV_SKILLS;
    return filtered.slice(0, limit);
  }
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  const scored: Array<{ skill: DevSkill; score: number }> = [];
  for (const skill of DEV_SKILLS) {
    if (opts.category && skill.category !== opts.category) continue;
    let score = 0;
    if (opts.category && skill.category === opts.category) score += 2;
    for (const tag of skill.tags) for (const t of tokens) if (tag.toLowerCase().includes(t)) score += 3;
    const summary = skill.summary.toLowerCase();
    for (const t of tokens) if (summary.includes(t)) score += 2;
    const body = skill.body.toLowerCase();
    for (const t of tokens) if (body.includes(t)) score += 1;
    if (skill.id.toLowerCase().includes(q)) score += 5;
    if (score > 0) scored.push({ skill, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.skill);
}

export function getDevSkill(id: string): DevSkill | undefined {
  return SKILL_BY_ID.get(id);
}

export type RerankedSkillSearch = {
  matches: DevSkill[];
  /** True when an NVIDIA reranker reordered the candidates; false when
   *  we fell back to the keyword ranking (empty query, single candidate,
   *  reranker not configured, or an upstream error). */
  reranked: boolean;
  /** How many candidates the stage-1 keyword pass produced. */
  candidateCount: number;
  /** Present only when reranking was skipped, explaining why. */
  note?: string;
};

/**
 * Two-stage retrieve-then-rerank search over the dev-skills corpus.
 *
 *   Stage 1 (retrieve): the cheap keyword/tag scorer (searchDevSkills)
 *     pulls a WIDE candidate pool — ~4x the requested count — so recall
 *     is high even when the operator's wording doesn't lexically match
 *     the record that actually answers them.
 *   Stage 2 (rerank): an NVIDIA reranking NIM (lib/nvidia/rerank.ts)
 *     scores every candidate against the query semantically and reorders
 *     them, so the record the operator MEANT ends up first — this is the
 *     "what / when / where / how" quality the keyword pass alone can't
 *     give.
 *
 * Reranking degrades gracefully: if NVIDIA isn't configured (e.g. local
 * dev with no key) or the call fails, we return the stage-1 keyword order
 * and set `reranked:false` with a `note`, so the caller and the operator
 * always get an answer and can see which path ran.
 */
export async function searchDevSkillsReranked(
  query: string,
  opts: { category?: DevSkill["category"]; limit?: number; signal?: AbortSignal } = {}
): Promise<RerankedSkillSearch> {
  const limit = Math.max(1, Math.min(20, opts.limit ?? 6));
  const q = query.trim();

  // No query — nothing to rank against. Return the catalog slice as-is.
  if (!q) {
    return {
      matches: searchDevSkills("", { category: opts.category, limit }),
      reranked: false,
      candidateCount: 0,
      note: "empty query — returned catalog order"
    };
  }

  // Stage 1: wide keyword prefilter for recall.
  const poolSize = Math.min(24, Math.max(limit * 4, 12));
  let pool = searchDevSkills(q, { category: opts.category, limit: poolSize });
  // If a category filter starved the pool, widen by dropping the filter so
  // the reranker still has real candidates to work with.
  if (pool.length === 0 && opts.category) {
    pool = searchDevSkills(q, { limit: poolSize });
  }

  if (pool.length <= 1) {
    return { matches: pool.slice(0, limit), reranked: false, candidateCount: pool.length };
  }

  // Stage 2: semantic rerank. Everything here — the lazy import (kept out
  // of the module graph for sync callers like the suggestions route), the
  // config check, and the upstream call — is wrapped so ANY failure
  // (module resolution, missing key, upstream error, timeout) degrades
  // cleanly to the stage-1 keyword order instead of throwing.
  try {
    const { rerankPassages, isRerankConfigured } = await import("@/lib/nvidia/rerank");
    if (!isRerankConfigured()) {
      return {
        matches: pool.slice(0, limit),
        reranked: false,
        candidateCount: pool.length,
        note: "NVIDIA reranker not configured — used keyword ranking"
      };
    }
    const passages = pool.map((s) => `${s.summary}\nTags: ${s.tags.join(", ")}\n${s.body}`);
    const ranked = await rerankPassages({ query: q, passages, topN: limit, signal: opts.signal });
    if (ranked.length === 0) {
      return {
        matches: pool.slice(0, limit),
        reranked: false,
        candidateCount: pool.length,
        note: "reranker returned no rankings — used keyword ranking"
      };
    }
    const reordered = ranked.map((r) => pool[r.index]).filter((s): s is DevSkill => Boolean(s));
    return { matches: reordered.slice(0, limit), reranked: true, candidateCount: pool.length };
  } catch (e) {
    return {
      matches: pool.slice(0, limit),
      reranked: false,
      candidateCount: pool.length,
      note: `reranker error — used keyword ranking (${e instanceof Error ? e.message : String(e)})`
    };
  }
}

export function listDevSkillCategories(): Array<{ category: DevSkill["category"]; count: number }> {
  const counts: Record<string, number> = {};
  for (const s of DEV_SKILLS) counts[s.category] = (counts[s.category] || 0) + 1;
  return (Object.keys(counts) as DevSkill["category"][]).map((c) => ({ category: c, count: counts[c] }));
}
