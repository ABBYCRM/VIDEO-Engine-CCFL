/**
 * Infrastructure controller for Claw Computer workers.
 * The LLM/browser agent MUST NOT call this. DIGITALOCEAN_TOKEN stays here.
 */

const API = "https://api.digitalocean.com/v2/droplets";

function token(): string {
  const t = process.env.DIGITALOCEAN_TOKEN?.trim();
  if (!t) throw new Error("DIGITALOCEAN_TOKEN is not configured on the orchestrator");
  return t;
}

export async function createBrowserDroplet(input?: { name?: string; tags?: string[] }) {
  const image = process.env.DIGITALOCEAN_BROWSER_SNAPSHOT_ID;
  const vpc = process.env.DIGITALOCEAN_VPC_UUID;
  if (!image) {
    return { ok: false as const, error: "DIGITALOCEAN_BROWSER_SNAPSHOT_ID is not set. Use the local Playwright worker until a golden snapshot exists." };
  }
  const payload = {
    name: input?.name || `claw-computer-${Date.now()}`,
    region: process.env.DIGITALOCEAN_REGION || "nyc3",
    size: process.env.DIGITALOCEAN_BROWSER_SIZE || "s-2vcpu-4gb",
    image: Number.isFinite(Number(image)) ? Number(image) : image,
    monitoring: true,
    tags: ["agent-worker", ...(input?.tags ?? [])],
    vpc_uuid: vpc || undefined
  };
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: `DigitalOcean HTTP ${res.status}` };
  return { ok: true as const, droplet: { id: body?.droplet?.id, name: body?.droplet?.name, status: body?.droplet?.status } };
}

export async function destroyBrowserDroplet(id: number) {
  const res = await fetch(`${API}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}` }
  });
  if (!res.ok && res.status !== 204) return { ok: false as const, error: `DigitalOcean HTTP ${res.status}` };
  return { ok: true as const };
}
