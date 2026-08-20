# Architecture Notes

## Chosen stack

- Next.js App Router for the application shell
- TypeScript strict mode
- Tailwind CSS for UI scaffolding
- PostgreSQL + pgvector for relational and prompt/avatar similarity data
- DigitalOcean App Platform + Managed Postgres + Spaces as the target deployment

## Core domains

### Campaigns
One-shot video requests, site context, and creative planning.

### Avatars
Canonical spokesperson identities and their 4-view turnaround source images.

### Prompt library
Reusable system and category prompt sets for consistent generation.

### Calendar
Queue of approved/pending/auto-post assets.

### Integrations
Composio / ad / social connectors.

### Monitoring
NVIDIA model routing and later creative ROI evaluation.
