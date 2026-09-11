# Claw Swarm

Grok-style multi-agent runtime on VIDEO-Engine. **Supervisor + planner + durable tasks + worker pool + leader synthesis.** Not a container per agent. Not NATS/Postgres until the single App Platform node is actually the bottleneck.

## What it is

- `POST /api/swarm` `op=create` starts a run
- Planner (Bitdeer Mistral Large 3 675B) turns the objective into a DAG of at most 4 agents
- Researchers (GLM-5, Mistral fallback) and a critic run as in-process workers
- Leader synthesizer returns the only operator-facing answer
- SQLite (`swarm_runs` / `swarm_tasks` / `swarm_events`) is the source of truth
- Queue is in-process; a lost notification cannot corrupt state because the DB decides if a task is still actionable
- Caps: 4 agents, depth 2, 2 attempts, 8 LLM calls, 120s default deadline

## What it is not

- Does not steal Claw Computer Chrome
- Does not open Forge sessions
- Does not farm CAPTCHAs, inject solver tokens, or rotate residential proxies
- Does not return subagent chain-of-thought
- Does not require NATS, managed Postgres, or a new Droplet for MVP

Scale-up path (when queue age, not CPU, says so): provider concurrency → worker concurrency → managed Postgres → NATS JetStream → DOKS. Computer + Forge already share this `basic-s` instance, so extra databases were not provisioned.

## API

`GET /api/swarm` — health + contract  
`GET /api/swarm?id=` — run snapshot  
`GET /api/swarm?list=1` — recent runs  
`POST /api/swarm` `{ op }`

| op | notes |
|---|---|
| create / run | `{ objective, maxAgents, deadlineMs }` |
| get | `{ id }` |
| list | recent runs |
| cancel | cooperative cancel |
| status | gateway + store |

## Claw tools

`swarm_run` `swarm_status` `swarm_cancel`

## Routing

| Role | Provider |
|---|---|
| planner | Bitdeer Mistral Large 3 675B Instruct |
| researcher | Bitdeer GLM-5, fallback Mistral |
| critic | Mistral |
| synthesizer / leader | Mistral |

Preview (App Builder) uses xAI `grok-4.5` for every role because that is the injected key there.

## UI

`/swarm` — launch, DAG, leader pane  
Claw console header + sidebar link Swarm
