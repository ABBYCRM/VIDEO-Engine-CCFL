import test from "node:test";
import assert from "node:assert/strict";
import { aionStatus, aionConsult, aionCurriculum, aionN8n } from "../../lib/claw/aion.ts";

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
    return Response.json({ok:true,app:"aion-brain",providers:["nvidia"],active_state:{private:"not-for-chat"}});
  };
  const status = await aionStatus();
  assert.equal(status.connected,true);
  assert.equal(status.echoOnly,false);
  assert.ok(!JSON.stringify(status).includes("not-for-chat"));
});
test("SSE handles byte boundaries, unicode, CRLF, fallbacks and stable sessions", async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    assert.equal(body.session_id,"claw:thread-one");
    assert.deepEqual(body.messages,[{role:"user",content:"Question"}]);
    return stream([{type:"error",message:"first provider unavailable"},{type:"decision",decision:{state:"GO"}},
      {type:"delta",text:"Hello 🌍"},{type:"done",provider:"nvidia",model:"test"},"[DONE]"],true);
  };
  const result = await aionConsult(" Question ",{conversationId:"thread-one"});
  assert.equal(result.answer,"Hello 🌍"); assert.equal(result.echoOnly,false);
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

test("n8n bridge forwards exact read/write arguments to Aion's actual tool route", async () => {
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,"http://aion-brain:10000/api/tools/n8n_aura");
    assert.deepEqual(JSON.parse(options?.body as string),{name:"memory_write",payload:{text:"test"}});
    return Response.json({ok:true,evidence:{id:"test"}});
  };
  assert.equal((await aionN8n("n8n_aura",{name:"memory_write",payload:{text:"test"}})).ok,true);
  await assert.rejects(aionN8n("arbitrary_tool",{}),/Unknown/);
});
