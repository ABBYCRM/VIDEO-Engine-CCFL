import { resumeOpenSwarm, swarmStatus } from "../lib/swarm/supervisor";

async function tick() {
  const status = swarmStatus();
  resumeOpenSwarm();
  return status;
}

async function main() {
  const first = await tick();
  console.log("[swarm-worker] start", {
    live: first.live,
    active: first.active,
    store: first.store,
  });
  setInterval(() => {
    void tick().catch((e) => {
      console.error("[swarm-worker]", e instanceof Error ? e.message : e);
    });
  }, 4000);
}

void main();
