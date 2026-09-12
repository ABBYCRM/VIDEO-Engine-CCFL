import test from "node:test";
import assert from "node:assert/strict";
import { aionStatus, aionConsult, aionCurriculum, aionN8n, aionExecute, aionContract, aionTools, aionAcceptanceForGoal, sanitizeAionToolResults, isToolfulGoal, dispatchAionPrompt, routeAionMode } from "../../lib/claw/aion.ts";

const originalFetch = globalThis.fetch;
const previousUrl = process.env.AION_BASE_URL;
const previousKey = process.env.AION_API_KEY;
test.beforeEach(() => { process.env.AION_BASE_URL = "http://aion-brain:10000"; process.env.AION_API_KEY = "test-only-key"; });
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousUrl === undefined) delete process.env.AION_BASE_URL; else process.env.AION_BASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.AION_API_KEY; else process.env.AION_API_KEY = previousKey;
});
function stream(events: unknown[], crlf = false) {
  const data = events.map(e => "data: " + (typeof e === "string" ? e : JSON.stringify(e)) + "\n\n").join("");
  const bytes = new TextEncoder().encode(crlf ? data.replaceAll("\n", "\r\n") : data);
  let index = 0;
  return new Response(new ReadableStream({pull(controller) {
    if(index === bytes.length) return controller.close();
    controller.enqueue(bytes.slice(index, ++index));
  }}), {headers:{"content-type":"text/event-stream"}});
}
test("status uses configured authentication and excludes global private state", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://aion-brain:10000/api/state");
    assert.equal((options?.headers as Record<string,string>)["X-AION-Key"], "test-only-key");
    assert.equal(options?.redirect, "error");
    return Response.json({
      ok:true,app:"aion-brain",providers:["nvidia"],
      agent_model:"nvidia/nemotron-3-ultra-550b-a55b",
      control_loop:{
        phases:["SELF-OBSERVATION","ACTION"],
        tools_configured:{tavily:true,composio:false},
        composio_key_type:"ak_",
        secret:"no"
      },
      active_state:{private:"not-for-chat"}
    });
  };
  const status = await aionStatus();
  assert.equal(status.connected,true);
  assert.equal(status.echoOnly,false);
  assert.equal(status.agentModel,"nvidia/nemotron-3-ultra-550b-a55b");
  assert.deepEqual(status.controlLoop?.phases,["SELF-OBSERVATION","ACTION"]);
  assert.deepEqual(status.controlLoop?.toolsConfigured,{tavily:true,composio:false});
  assert.equal(status.controlLoop?.composioKeyType,"ak_");
  assert.ok(!JSON.stringify(status).includes("not-for-chat"));
  assert.ok(!JSON.stringify(status).includes("\"secret\""));
});
test("consult includes SELF_STATE when the control loop provides it", async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    assert.match(body.messages[0].content, /SELF_STATE/);
    assert.match(body.messages[0].content, /LOOP_DETECTED/);
    assert.match(body.messages[0].content, /Question/);
    return stream([{type:"delta",text:"change strategy"},{type:"done",provider:"nvidia",model:"test"}]);
  };
  const result = await aionConsult("Question", { conversationId: "thread-one", selfState: "{\"health\":\"LOOP_DETECTED\"}" });
  assert.equal(result.answer, "change strategy");
});
test("SSE handles byte boundaries, unicode, CRLF, fallbacks and stable sessions", async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    assert.equal(body.session_id,"claw:thread-one");
    assert.deepEqual(body.messages,[{role:"user",content:"Question"}]);
    assert.equal("agentic" in body, false);
    return stream([{type:"error",message:"first provider unavailable"},{type:"decision",decision:{state:"GO"}},
      {type:"delta",text:"Hello 🌍"},{type:"done",provider:"nvidia",model:"test"},"[DONE]"],true);
  };
  const result = await aionConsult(" Question ",{conversationId:"thread-one"});
  assert.equal(result.answer,"Hello 🌍"); assert.equal(result.echoOnly,false);
});
test("consult sends agentic only when the caller opts in; SSE parser is unchanged", async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    assert.equal(body.agentic, true);
    assert.deepEqual(body.messages,[{role:"user",content:"Question"}]);
    return stream([{type:"decision",decision:{state:"GO"}},{type:"delta",text:"looped"},{type:"done",provider:"nvidia",model:"ultra"}]);
  };
  const result = await aionConsult("Question",{conversationId:"thread-one",agentic:true});
  assert.equal(result.answer,"looped");
  assert.equal(result.echoOnly,false);
});
test("incomplete and failed streams are not successful answers", async () => {
  for (const events of [[{type:"error"},"[DONE]"],[{type:"delta",text:"partial"},"[DONE]"],[{type:"done"},"[DONE]"]]) {
    globalThis.fetch = async () => stream(events);
    await assert.rejects(aionConsult("x",{conversationId:"t"}),/did not complete/);
  }
});
test("echo is explicitly identified", async () => {
  globalThis.fetch = async () => stream([{type:"delta",text:"echo"},{type:"done",provider:"echo"}]);
  assert.equal((await aionConsult("x",{conversationId:"t"})).echoOnly,true);
});
test("missing configuration, unsafe origins and upstream auth failures remain errors", async () => {
  delete process.env.AION_API_KEY;
  await assert.rejects(aionStatus(),/not configured/);
  process.env.AION_API_KEY="test-only-key";
  for (const url of ["http://public.example","https://user:pass@example.com","https://example.com/path"]) {
    process.env.AION_BASE_URL=url; await assert.rejects(aionStatus());
  }
  process.env.AION_BASE_URL="http://aion-brain:10000";
  globalThis.fetch=async()=>new Response("sensitive upstream body",{status:401});
  await assert.rejects(aionStatus(),error => error instanceof Error && /HTTP 401/.test(error.message) && !error.message.includes("sensitive"));
});
test("invalid prompts and missing conversation fail before calling network", async () => {
  globalThis.fetch=async()=>{throw Error("unexpected network")};
  await assert.rejects(aionConsult("x"),/conversation/);
  await assert.rejects(aionConsult("",{conversationId:"t"}),/prompt/);
});
test("caller cancellation is forwarded to fetch", async () => {
  const controller=new AbortController();controller.abort();
  globalThis.fetch=async(_url,options)=>{assert.equal(options?.signal?.aborted,true);throw new DOMException("Aborted","AbortError")};
  await assert.rejects(aionStatus({signal:controller.signal}),{name:"AbortError"});
});
test("full curriculum survives the tool preview limit and invalid payloads fail", async () => {
  const content="# Comprehensive Software & Technology SQM\n"+"lesson\n".repeat(2000);
  globalThis.fetch=async()=>new Response(content);
  const result=await aionCurriculum(["Python"],"markdown",{conversationId:"t"});
  assert.equal(result.bytes.toString(),content);
  await assert.rejects(aionCurriculum("Python","markdown",{conversationId:"t"}),/topics/);
  globalThis.fetch=async()=>Response.json({error:"bad"});
  await assert.rejects(aionCurriculum(["Python"],"json",{conversationId:"t"}),/invalid curriculum/);
});

test("execute posts the contract body to /api/claw/execute and whitelists evidence", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://aion-brain:10000/api/claw/execute");
    const body = JSON.parse(options?.body as string);
    assert.equal(body.goal, "Search live news");
    assert.deepEqual(body.acceptance, [{ id: "search", description: "live search ran", tool: "web_search" }]);
    assert.equal(body.session_id, "claw:thread-one");
    assert.equal(body.max_cycles, 8);
    assert.equal(body.stream, false);
    return Response.json({
      ok: true, source: "aion-brain", status: "COMPLETE", complete: true, verified: true,
      answer: "I searched.", session_id: "claw:thread-one",
      self_state: { previous_tool_results: [{ tool: "web_search", ok: true, id: "ev1", preview: "hits" }], health: "HEALTHY", progress: 1, secret: "no" },
      cycles: [{ health: "HEALTHY", issues: [], action: { kind: "tool", tool: "web_search", ok: true } }],
      previous_tool_results: [{ tool: "web_search", ok: true, id: "ev1", preview: "hits" }]
    });
  };
  const result = await aionExecute({
    goal: "Search live news",
    acceptance: [{ id: "search", description: "live search ran", tool: "web_search" }],
    sessionId: "claw:thread-one",
    maxCycles: 8
  }, { conversationId: "thread-one" });
  assert.equal(result.source, "aion-brain");
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.complete, true);
  assert.equal(result.verified, true);
  assert.deepEqual(result.previous_tool_results, [{ name: "web_search", ok: true, preview: "hits", evidence_id: "ev1" }]);
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("contract and tools GETs use the claw aliases", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/claw/contract")) {
      return Response.json({ ok: true, contract: { version: "0.1.16", phases: ["ACTION"], health: ["HEALTHY"], completion: "tool evidence", anti_loop: ">=2" } });
    }
    assert.equal(url, "http://aion-brain:10000/api/claw/tools");
    return Response.json({ ok: true, count: 1, tools: [{ name: "web_search", description: "search", key: "no" }] });
  };
  const contract = await aionContract();
  assert.equal(contract.version, "0.1.16");
  assert.deepEqual(contract.phases, ["ACTION"]);
  globalThis.fetch = async (url) => {
    assert.equal(url, "http://aion-brain:10000/api/claw/tools");
    return Response.json({ ok: true, count: 1, tools: [{ name: "web_search", description: "search", key: "no" }] });
  };
  const tools = await aionTools();
  assert.deepEqual(tools.tools, [{ name: "web_search", description: "search" }]);
  assert.ok(!JSON.stringify(tools).includes("\"key\""));
});
test("acceptance helpers stay on documented brain tools", () => {
  assert.deepEqual(aionAcceptanceForGoal("Please search the docket"), [{ id: "search", description: "live search ran", tool: "web_search" }]);
  assert.equal(isToolfulGoal("search the docket"), true);
  assert.equal(isToolfulGoal("run osint on the subject"), true);
  assert.equal(isToolfulGoal("arxiv transformer papers"), true);
  assert.equal(isToolfulGoal("email the client the dates"), true);
  assert.deepEqual(aionAcceptanceForGoal("run osint on the subject"), []);
  assert.deepEqual(sanitizeAionToolResults([{ tool: "datetime", ok: true, id: "t1" }]), [{ name: "datetime", ok: true, evidence_id: "t1" }]);
});

test("consult drops control-loop SSE events from the user-facing answer", async () => {
  globalThis.fetch = async () => stream([
    { type: "self_state", health: "HEALTHY", free_energy: 0.2 },
    { type: "trinity", reasons: ["need evidence"] },
    { type: "delta", text: "SELF_OBSERVATION phase\nfree_energy: 0.2\n" },
    { type: "delta", text: "The docket lists two hearings." },
    { type: "done", provider: "nvidia", model: "test" }
  ]);
  const result = await aionConsult("Question", { conversationId: "thread-one" });
  assert.equal(result.answer, "The docket lists two hearings.");
  assert.doesNotMatch(result.answer, /SELF_OBSERVATION|free_energy|self_state/i);
});

test("actionable prompts dispatch to execute, advice stays consult", async () => {
  assert.equal(routeAionMode("Search live news"), "execute");
  assert.equal(routeAionMode("What do you think about Trinity?"), "consult");
  const seen: string[] = [];
  globalThis.fetch = async (url, options) => {
    seen.push(String(url));
    if (String(url).endsWith("/api/claw/execute")) {
      const body = JSON.parse(String(options?.body));
      assert.equal(body.goal, "Search live news");
      return Response.json({
        ok: true, source: "aion-brain", status: "COMPLETE", complete: true, verified: true,
        answer: "SELF_STATE health=HEALTHY\nI searched.", session_id: "claw:thread-one",
        self_state: { previous_tool_results: [{ tool: "web_search", ok: true, id: "ev1", preview: "hits" }], health: "HEALTHY", progress: 1 },
        cycles: [{ health: "HEALTHY" }],
        previous_tool_results: [{ tool: "web_search", ok: true, id: "ev1", preview: "hits" }]
      });
    }
    return stream([{ type: "delta", text: "Trinity is a gate, not a dump." }, { type: "done", provider: "nvidia", model: "test" }]);
  };
  const executed = await dispatchAionPrompt("Search live news", { conversationId: "thread-one" });
  assert.equal(executed.mode, "execute");
  assert.ok(seen.some((u) => u.endsWith("/api/claw/execute")));
  assert.equal(executed.answer, "I searched.");
  assert.doesNotMatch(executed.answer, /SELF_STATE/);
  seen.length = 0;
  const consulted = await dispatchAionPrompt("What do you think about Trinity?", { conversationId: "thread-one" });
  assert.equal(consulted.mode, "consult");
  assert.ok(seen.some((u) => u.endsWith("/api/chat")));
  assert.equal(consulted.answer, "Trinity is a gate, not a dump.");
});
test("cursor proxy forwards launch to Brain /api/cursor/launch with X-AION-Key and never hits api.cursor.com", async () => {
  const { aionCursorLaunch } = await import("../../lib/claw/aion.ts");
  let seen = "";
  globalThis.fetch = async (url, options) => {
    seen = String(url);
    assert.equal((options?.headers as Record<string, string>)["X-AION-Key"], "test-only-key");
    assert.equal(options?.redirect, "error");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.prompt, "land the fix");
    assert.ok(!seen.includes("api.cursor.com"));
    return Response.json({ ok: true, source: "aion-brain", tool: "cursor_launch", evidence: { agent: { id: "bc-1" }, run: { id: "run-1" } } }, { status: 202 });
  };
  const result = await aionCursorLaunch({ prompt: "land the fix", repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL" });
  assert.equal(seen, "http://aion-brain:10000/api/cursor/launch");
  assert.equal(result.ok, true);
  assert.equal(result.source, "aion-brain");
  assert.equal(result.trinity, "GO");
});
test("n8n bridge forwards exact read/write arguments to Aion's actual tool route", async () => {
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,"http://aion-brain:10000/api/tools/n8n_aura");
    assert.deepEqual(JSON.parse(options?.body as string),{name:"memory_write",payload:{text:"test"}});
    return Response.json({ok:true,evidence:{id:"test"}});
  };
  assert.equal((await aionN8n("n8n_aura",{name:"memory_write",payload:{text:"test"}})).ok,true);
  await assert.rejects(aionN8n("arbitrary_tool",{}),/Unknown/);
});
