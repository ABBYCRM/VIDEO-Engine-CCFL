import { db } from "@/lib/db";
import { createJob, getJob } from "@/lib/jobs";
import { generateCampaignStill } from "@/lib/campaign-image";
import { listAvatars } from "@/lib/avatars";
import { listSites } from "@/lib/sites";
import { listGeneratedImages, deleteGeneratedImage } from "@/lib/media-library";
import { listPersistentLibraryAssets, deletePersistentLibraryAsset } from "@/lib/persistent-library";
import { publishInstagram } from "@/lib/instagram-publish";
import { claimInstagramPublish, publishInstagramPair, releaseInstagramPublish } from "@/lib/calendar-publisher";
import { verifyPublishedInstagramOnce } from "@/lib/publish-verify";
import { getEngineSettings } from "@/lib/settings";
import { type ProviderId } from "@/lib/providers";
import type { CampaignCategory } from "@/lib/prompts";
import {
  instagramHealthcheck,
  isInstagramConfigured,
  isInstagramDmEnabled,
  listMedia,
  getComments,
  getMediaInsights,
  getMediaVisual,
  replyToComment,
  hideComment,
  deleteComment,
  sendPrivateReplyToComment,
  listConversations,
  getConversationMessages,
  sendDirectMessage
} from "@/lib/instagram-graph";
import {
  composioGetComments,
  composioGetMediaInsights,
  composioGetMessages,
  composioListConversations,
  composioListMedia,
  composioReplyComment,
  composioSendMessage,
  composioUserInfo,
  isComposioInstagramConnected
} from "@/lib/instagram-composio";
import { withInstagramFallback } from "@/lib/claw/fallback";
import { getInstagramDmCapability } from "@/lib/claw/instagram-dm-capability";
import { digArray, summarizeMedia } from "@/lib/claw/instagram-media-shape";
import { deleteClawFile, getFile as getClawFile, listFiles, readClawFileText, renameClawFile } from "@/lib/claw/store";
import fsp from "node:fs/promises";
import { parseCreatorFormats, uploadAndScheduleCreatorVideo } from "@/lib/creator-upload";
import { generateCreatorCaption } from "@/lib/creator-caption";
import { isComposioConfigured } from "@/lib/composio/client";
import { isSteelConfigured, scrapeWithSteel } from "@/lib/steel";
import { scrapeWithFirecrawl } from "@/lib/firecrawl";
import { scrapeWithScrapingBee } from "@/lib/scrapingbee";
import { scrapeWithScrapfly } from "@/lib/scrapfly";
import { takeScreenshot } from "@/lib/screenshotone";
import { webSearch } from "@/lib/web-search";
import { analyzeImage } from "@/lib/nvidia/vision";
import { validateSteelUrl } from "@/lib/steel-url";
import { writeStandalonePost } from "@/lib/nvidia/content-writer";
import type { PlatformKey } from "@/lib/nvidia/schemas";
import crypto from "node:crypto";
import { generateFullBlogPost, getBlogPost } from "@/lib/nvidia/blog-writer";
import { publishWebsite } from "@/lib/site-publish";
import { getSite } from "@/lib/sites";
import { generateGeoForPost, buildLlmsTxt } from "@/lib/geo/generate";
import { createStrategy, getStrategy, listStrategies, updateStrategy } from "@/lib/strategies";
import { planStrategy } from "@/lib/nvidia/strategy-planner";
import { isYouTubeConnected } from "@/lib/youtube";
import { auditWebsite } from "@/lib/site-audit";
import { composioDeleteTweet, composioGetTweet, composioListMentions, composioPostTweet, composioReplyTweet, isXComposioConnected } from "@/lib/x-composio";
import { composioCommentOnPost, composioGetMyInfo, composioPostUpdate, isLinkedInComposioConnected } from "@/lib/linkedin-composio";
import { composioListComments as composioRedditListComments, composioReplyComment as composioRedditReplyComment, composioSearchSubreddits, composioSubmitPost, isRedditComposioConnected } from "@/lib/reddit-composio";
import { redditPreSubmitReminder } from "@/lib/reddit/rules-check";
import { isImageGenEnabled } from "@/lib/feature-flags";
import { listInfluencers, updateInfluencerStatus } from "@/lib/influencers";
import { discoverByInstagramUsername, discoverFromUrl } from "@/lib/influencer-discovery";
import { sendOutreach } from "@/lib/influencer-outreach";
import { createCodingSession, isCodingSandboxConfigured, listFiles as codingListFiles, readFile as codingReadFile, runCommand as codingRunCommand, writeFile as codingWriteFile } from "@/lib/coding-agent/client";

export type ClawTool = {
  name: string;
  description: string;
  args: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const CATEGORIES = new Set(["car_accident", "rideshare", "trucking", "slip_fall", "ugc"]);
function isProviderId(v: string): v is ProviderId {
  return v === "veo" || v === "grok" || v === "a2e" || v === "hedra";
}
const PLATFORM_KEYS = ["instagram", "facebook", "youtube", "tiktok", "x", "linkedin", "reddit"] as const;
function isPlatformKey(v: string): v is PlatformKey {
  return (PLATFORM_KEYS as readonly string[]).includes(v);
}

function str(v: unknown, fallback = "") { return v == null ? fallback : String(v); }
function num(v: unknown, fallback: number) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clip(v: unknown, n = 4000) { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; }

function publicJob(j: any) {
  if (!j) return null;
  return {
    id: j.id,
    category: j.category,
    provider: j.provider,
    model: j.model,
    status: j.status,
    error: j.error,
    createdAt: j.createdAt,
    fileUrl: j.status === "succeeded" ? `/api/v1/video/${j.id}/file` : null
  };
}

export const CLAW_TOOLS: ClawTool[] = [
  {
    name: "app_status",
    description: "Pipeline snapshot: providers, Instagram (Composio primary, Graph fallback), Steel, NVIDIA, open jobs.",
    args: "{}",
    handler: async () => {
      const settings = getEngineSettings();
      const jobs = db.prepare("SELECT status, COUNT(*) as n FROM video_jobs GROUP BY status").all() as { status: string; n: number }[];
      const ig = await instagramHealthcheck();
      const composioReady = isComposioInstagramConnected();
      const dm = getInstagramDmCapability({
        composioReady,
        graphReady: ig.live,
        graphDmEnabled: isInstagramDmEnabled()
      });
      return {
        defaultProvider: settings.defaultProvider,
        video: settings.providers,
        nvidia: settings.nvidia,
        image: settings.image,
        instagram: {
          ...ig,
          primary: "composio",
          composioPrimary: composioReady,
          graphDmEnabled: isInstagramDmEnabled(),
          dm
        },
        composio: { configured: isComposioConfigured() },
        steel: { configured: isSteelConfigured() },
        jobs
      };
    }
  },
  {
    // Named to match what the model naturally reaches for when a user asks
    // about "Composio" — the system prompt mentions Composio as a provider
    // without ever listing a bare tool literally named "composio",
    // which was causing "Unknown tool composio" hallucinated calls. This
    // tool exists so that instinct resolves to something real.
    name: "composio_health",
    description: "Composio status: API key configured, and every cataloged toolkit's auth-config + live-connection state.",
    args: "{}",
    handler: async () => {
      const settings = getEngineSettings();
      const connected = db.prepare("SELECT toolkit, status, last_sync_at FROM connected_accounts WHERE UPPER(status)='ACTIVE'").all() as { toolkit: string; status: string; last_sync_at: string | null }[];
      const connectedByToolkit = new Map(connected.map((c) => [c.toolkit, c]));
      return {
        keyConfigured: settings.composio.keyConfigured,
        toolkits: settings.composio.toolkits.map((t) => ({
          id: t.id,
          authConfigConfigured: t.authConfigConfigured,
          connected: connectedByToolkit.has(t.id),
          lastSyncAt: connectedByToolkit.get(t.id)?.last_sync_at || null
        }))
      };
    }
  },
  {
    name: "list_jobs",
    description: "Recent video jobs.",
    args: "{\"limit\":20}",
    handler: async (a) => {
      const limit = Math.max(1, Math.min(40, num(a.limit, 20)));
      const rows = db.prepare("SELECT id,category,provider,model,status,error,created_at,updated_at FROM video_jobs ORDER BY created_at DESC LIMIT ?").all(limit);
      return { jobs: rows };
    }
  },
  {
    name: "get_job",
    description: "One video job by id.",
    args: "{\"id\":\"uuid\"}",
    handler: async (a) => publicJob(getJob(str(a.id)))
  },
  {
    name: "generate_video",
    description: "Start one Hedra/Veo/Grok/A2E video. Same as Create.",
    args: "{\"mission\":\"...\",\"category\":\"car_accident|rideshare|trucking|slip_fall|ugc\",\"provider\":\"hedra\",\"model\":\"fal/grok-video-i2v\"}",
    handler: async (a) => {
      if (!isImageGenEnabled()) throw new Error("Image/video generation is disabled (manual-calendar mode). Set IMAGE_GEN_ENABLED=true to re-enable.");
      const category = str(a.category, "ugc") as CampaignCategory;
      if (!CATEGORIES.has(category)) throw new Error("category must be car_accident, rideshare, trucking, slip_fall, or ugc");
      const provider = (isProviderId(str(a.provider)) ? str(a.provider) : undefined) as ProviderId | undefined;
      const job = await createJob({
        source: "admin",
        category,
        mission: str(a.mission || a.prompt),
        subject: str(a.subject) || undefined,
        script: str(a.script) || undefined,
        provider,
        model: str(a.model) || undefined,
        avatarId: str(a.avatarId) || undefined
      });
      return { started: true, job: publicJob(job) };
    }
  },
  {
    name: "ugc_batch_generate",
    description: "UGC Videos Agent: enqueue up to 25 UGC video briefs in one call (each still one Veo/Hedra/Grok/A2E job — no fan-out per brief).",
    args: "{\"briefs\":[{\"mission\":\"...\",\"subject\":\"optional\",\"script\":\"optional\",\"avatarId\":\"optional\"}],\"provider\":\"hedra\"}",
    handler: async (a) => {
      if (!isImageGenEnabled()) throw new Error("Image/video generation is disabled (manual-calendar mode). Set IMAGE_GEN_ENABLED=true to re-enable.");
      const briefs = Array.isArray(a.briefs) ? a.briefs : [];
      if (!briefs.length) throw new Error("briefs[] is required");
      if (briefs.length > 25) throw new Error("A batch is limited to 25 briefs");
      const provider = (isProviderId(str(a.provider)) ? str(a.provider) : undefined) as ProviderId | undefined;
      const jobs: any[] = [];
      const failed: { index: number; error: string }[] = [];
      for (let i = 0; i < briefs.length; i++) {
        const brief = briefs[i] as Record<string, unknown>;
        const mission = str(brief?.mission);
        if (!mission) { failed.push({ index: i, error: "mission is required" }); continue; }
        try {
          const job = await createJob({ source: "admin", category: "ugc", mission, subject: str(brief?.subject) || undefined, script: str(brief?.script) || undefined, provider, model: str(a.model) || undefined, avatarId: str(brief?.avatarId) || undefined });
          jobs.push({ index: i, id: job.id, status: job.status });
        } catch (e) {
          failed.push({ index: i, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return { queued: jobs.length, jobs, failed };
    }
  },
  {
    name: "generate_still",
    description: "Generate a campaign still into Library + Calendar. For the operator's existing Pixar-style 3D cartoon brand look (the animated character/vehicle scenes with the navy side panel and orange CaseClosedFL footer bar — this is the SAME system that produced the operator's existing Pixar-style Instagram/site posts, not a new style to invent), pass stillTemplateId as one of: cartoon-slip-fall-grocery, cartoon-car-crash-rear-end, cartoon-trucking-highway, cartoon-rideshare-curbside, cartoon-workplace-construction, cartoon-pedestrian-crosswalk, cartoon-medical-bills — or omit stillTemplateId and just pass category (car_accident, rideshare, trucking, slip_fall) to auto-pick a matching template. Without stillTemplateId/category this generates a photorealistic (non-cartoon) still instead.",
    args: "{\"prompt\":\"...\",\"avatarId\":\"optional\",\"stillTemplateId\":\"optional — e.g. cartoon-car-crash-rear-end for the Pixar-style look\",\"category\":\"optional — car_accident|rideshare|trucking|slip_fall|ugc\",\"seed\":\"optional — same seed+template always renders the same variant\"}",
    handler: async (a) => {
      if (!isImageGenEnabled()) throw new Error("Image/video generation is disabled (manual-calendar mode). Set IMAGE_GEN_ENABLED=true to re-enable.");
      const prompt = str(a.prompt || a.mission);
      if (!prompt) throw new Error("prompt is required");
      const still = await generateCampaignStill({
        prompt,
        avatarId: str(a.avatarId) || null,
        stillTemplateId: str(a.stillTemplateId) || null,
        category: str(a.category) || null,
        seed: str(a.seed) || null
      });
      return { assetId: still.assetId, assetUrl: still.assetUrl, model: still.model };
    }
  },
  {
    name: "list_library",
    description: "Recent Library assets.",
    args: "{\"limit\":20}",
    handler: async (a) => {
      const limit = Math.max(1, Math.min(40, num(a.limit, 20)));
      const persistent = await listPersistentLibraryAssets().catch(() => []);
      const generated = listGeneratedImages(limit).map((image) => ({
        id: `generated:${image.id}`, kind: "generated", mediaType: "image", title: image.model || "Generated image", url: image.url, createdAt: image.createdAt
      }));
      const videos = (db.prepare("SELECT id,category,provider,status,created_at FROM video_jobs WHERE status='succeeded' AND output_path IS NOT NULL ORDER BY updated_at DESC LIMIT ?").all(limit) as any[])
        .map((v) => ({ id: `video:${v.id}`, kind: "video", url: `/api/v1/video/${v.id}/file`, title: `${v.provider} ${v.category}`, createdAt: v.created_at }));
      const assets = [...persistent, ...generated, ...videos].slice(0, limit);
      return { assets: assets.map((x: any) => ({ id: x.id, kind: x.kind, title: x.title, url: x.url, createdAt: x.createdAt })) };
    }
  },
  {
    name: "delete_library_asset",
    description: "Delete a Library asset by id (generated: / video: / persistent).",
    args: "{\"id\":\"generated:...\"}",
    handler: async (a) => {
      const id = str(a.id);
      if (!id) throw new Error("id is required");
      if (id.startsWith("avatar:")) throw new Error("Avatar assets are managed from Avatars");
      if (id.startsWith("generated:")) await deleteGeneratedImage(id.slice("generated:".length));
      else if (id.startsWith("video:")) {
        db.prepare("DELETE FROM video_jobs WHERE id=?").run(id.slice("video:".length));
        await deletePersistentLibraryAsset(id).catch(() => {});
      } else {
        await deletePersistentLibraryAsset(id);
      }
      return { ok: true, id };
    }
  },
  {
    name: "list_calendar",
    description: "Calendar slots. Filter by status.",
    args: "{\"status\":\"pending|approved|published|failed\",\"limit\":20}",
    handler: async (a) => {
      const limit = Math.max(1, Math.min(40, num(a.limit, 20)));
      const status = str(a.status);
      const rows = status
        ? db.prepare("SELECT id,title,network,scheduled_at,status,auto_post,caption,content_type,generation_status,instagram_permalink,error FROM scheduled_posts WHERE status=? ORDER BY scheduled_at DESC LIMIT ?").all(status, limit)
        : db.prepare("SELECT id,title,network,scheduled_at,status,auto_post,caption,content_type,generation_status,instagram_permalink,error FROM scheduled_posts ORDER BY scheduled_at DESC LIMIT ?").all(limit);
      return { posts: rows };
    }
  },
  {
    name: "update_calendar",
    description: "Patch a calendar item: status, caption, autoPost.",
    args: "{\"id\":\"...\",\"status\":\"approved\",\"caption\":\"...\",\"autoPost\":true}",
    handler: async (a) => {
      const id = str(a.id);
      const current = db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id) as any;
      if (!current) throw new Error("Calendar item not found");
      const status = a.status ? str(a.status) : current.status;
      const caption = a.caption !== undefined ? str(a.caption).slice(0, 5000) : current.caption;
      const autoPost = a.autoPost === undefined ? current.auto_post : (a.autoPost ? 1 : 0);
      db.prepare("UPDATE scheduled_posts SET status=?,caption=?,auto_post=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, caption, autoPost, id);
      return db.prepare("SELECT id,title,status,auto_post,caption,scheduled_at FROM scheduled_posts WHERE id=?").get(id);
    }
  },
  {
    name: "publish_calendar",
    description: "Publish one approved Instagram calendar item now.",
    args: "{\"id\":\"...\"}",
    handler: async (a) => {
      const id = str(a.id);
      const post = db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id) as any;
      if (!post) throw new Error("Calendar item not found");
      if (post.network !== "instagram") throw new Error("Only Instagram calendar items auto-publish here");
      if (!claimInstagramPublish(post.id)) throw new Error("Already publishing");
      try {
        const result = await publishInstagramPair(post);
        db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,publishing_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(), id);
        setTimeout(() => { void verifyPublishedInstagramOnce(); }, 15_000).unref?.();
        return { ok: true, via: result?.reel?.via || result?.story?.via || "instagram-mcp", result };
      } catch (e) {
        releaseInstagramPublish(id);
        const message = e instanceof Error ? e.message : String(e);
        db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message.slice(0, 2000), id);
        throw e;
      }
    }
  },
  {
    name: "delete_calendar",
    description: "Delete a calendar slot.",
    args: "{\"id\":\"...\"}",
    handler: async (a) => {
      const r = db.prepare("DELETE FROM scheduled_posts WHERE id=?").run(str(a.id));
      if (!r.changes) throw new Error("Not found");
      return { ok: true };
    }
  },
  {
    name: "list_campaigns",
    description: "Campaigns.",
    args: "{\"limit\":20}",
    handler: async (a) => {
      const rows = db.prepare("SELECT id,name,category,status,video_provider,output_mode,created_at FROM campaigns ORDER BY created_at DESC LIMIT ?").all(Math.max(1, Math.min(40, num(a.limit, 20))));
      return { campaigns: rows };
    }
  },
  {
    name: "list_avatars",
    description: "Canonical avatars.",
    args: "{}",
    handler: async () => ({ avatars: listAvatars().map((x) => ({ id: x.id, name: x.name, status: x.status, turnaroundStatus: x.turnaroundStatus, a2eTwinStatus: x.a2eTwinStatus })) })
  },
  {
    name: "list_sites",
    description: "Connected websites.",
    args: "{}",
    handler: async () => ({ sites: listSites().map((s: any) => ({ id: s.id, name: s.name, url: s.url, status: s.status })) })
  },
  {
    name: "ig_health",
    description: "Instagram health check. Composio is primary, official Graph (instagram-mcp) is fallback (operator directive 2026-08-29). Always report which path is live.",
    args: "{}",
    handler: async () => {
      const graph = await instagramHealthcheck();
      let composio: unknown = null;
      if (isComposioInstagramConnected()) {
        try { composio = { connected: true, info: await composioUserInfo() }; }
        catch (e) { composio = { connected: true, error: e instanceof Error ? e.message : String(e) }; }
      } else {
        composio = { connected: false };
      }
      const composioLive = Boolean(composio && (composio as { connected: boolean }).connected && (composio as { error?: string }).error === undefined);
      const dm = getInstagramDmCapability({
        composioReady: composioLive,
        graphReady: graph.live,
        graphDmEnabled: isInstagramDmEnabled()
      });
      return {
        primary: "composio",
        graph,
        composio,
        graphDmEnabled: isInstagramDmEnabled(),
        dm,
        note: composioLive
          ? "Composio Instagram is the primary MCP. Official Graph (instagram-mcp) is fallback only — only used if Composio is disconnected or errors."
          : graph.live
            ? "Composio Instagram is disconnected or erroring. Claw will use official Graph (instagram-mcp) as fallback and tell you."
            : "Neither Composio nor Graph Instagram is ready."
      };
    }
  },
  {
    name: "ig_list_media",
    description: "List recent Instagram media with real, usable media ids (id is always present and first — never guess or invent one, always read it from this result). No view/play counts here — call ig_media_insights per media id for those.",
    args: "{\"limit\":12}",
    handler: async (a) => {
      const result = await withInstagramFallback(
        "ig_list_media",
        {
          composio: isComposioInstagramConnected() ? async () => composioListMedia(num(a.limit, 12)) : undefined,
          graph: async () => listMedia(num(a.limit, 12))
        }
      );
      const items = digArray(result.data) || [];
      return { via: result.via, fallbackNote: result.fallbackNote, media: summarizeMedia(items) };
    }
  },
  {
    name: "ig_media_insights",
    description: "View/reach/likes/comments/saved/shares for one media id. Get the id from ig_list_media first — never invent one.",
    args: "{\"mediaId\":\"...\"}",
    handler: async (a) => {
      const mediaId = str(a.mediaId || a.id);
      if (!mediaId) throw new Error("mediaId is required — call ig_list_media first to get a real one");
      return withInstagramFallback(
        "ig_media_insights",
        {
          composio: isComposioInstagramConnected() ? async () => composioGetMediaInsights(mediaId) : undefined,
          graph: async () => getMediaInsights(mediaId)
        }
      );
    }
  },
  {
    name: "ig_analyze_media",
    description: "Look at what a specific Instagram post actually shows (not just its caption/metadata) — style, subject, whether it's a real photo vs. an illustration/3D render, etc. Get the id from ig_list_media first. Requires direct Graph credentials (INSTAGRAM_MCP_ACCESS_TOKEN) — Composio's media-URL field isn't verified in this build, so this only works via the Graph path regardless of which provider is primary for other Instagram tools. For a carousel post this looks at the first slide only.",
    args: "{\"mediaId\":\"...\",\"question\":\"optional — defaults to a general style/content description\"}",
    handler: async (a) => {
      const mediaId = str(a.mediaId || a.id);
      if (!mediaId) throw new Error("mediaId is required — call ig_list_media first to get a real one");
      const visual = await getMediaVisual(mediaId);
      if (!visual.imageUrl) {
        throw new Error(visual.mediaType ? `No fetchable image URL for this ${visual.mediaType} (Graph didn't return media_url/thumbnail_url — the media may be inaccessible or a video still processing).` : "Could not resolve this media id via Graph.");
      }
      const question = str(a.question, "Describe what this image actually shows: subject, setting, and visual style — specifically call out whether it looks like a real photograph, a Pixar/Disney-style 3D animated render, a 2D illustration, or something else.");
      const description = await analyzeImage({ imageUrl: visual.imageUrl, question });
      return { mediaId, mediaType: visual.mediaType, carouselChildCount: visual.carouselChildCount, description };
    }
  },
  {
    name: "analyze_image",
    description: "Look at any public image URL and answer a question about it (style, subject, content) using a vision-capable model. Never use it for local/private URLs.",
    args: "{\"url\":\"https://...\",\"question\":\"what does this image show?\"}",
    handler: async (a) => {
      const url = validateSteelUrl(a.url);
      const question = str(a.question, "Describe what this image shows, including its visual style.");
      const description = await analyzeImage({ imageUrl: url, question });
      return { url, description };
    }
  },
  {
    name: "ig_get_comments",
    description: "Read comments on an Instagram media id. Get the id from ig_list_media first — never invent one.",
    args: "{\"mediaId\":\"...\"}",
    handler: async (a) => {
      const mediaId = str(a.mediaId || a.id);
      if (!mediaId) throw new Error("mediaId is required — call ig_list_media first to get a real one");
      return withInstagramFallback(
        "ig_get_comments",
        {
          composio: isComposioInstagramConnected() ? async () => composioGetComments(mediaId) : undefined,
          graph: async () => getComments(mediaId)
        }
      );
    }
  },
  {
    name: "ig_reply_comment",
    description: "Reply to an Instagram comment.",
    args: "{\"commentId\":\"...\",\"message\":\"...\"}",
    handler: async (a) => {
      const commentId = str(a.commentId);
      const message = str(a.message || a.text);
      if (!commentId || !message) throw new Error("commentId and message are required");
      return withInstagramFallback(
        "ig_reply_comment",
        {
          composio: isComposioInstagramConnected() ? async () => composioReplyComment(commentId, message) : undefined,
          graph: async () => replyToComment(commentId, message)
        }
      );
    }
  },
  {
    name: "ig_hide_comment",
    description: "Hide or unhide an Instagram comment (Graph).",
    args: "{\"commentId\":\"...\",\"hide\":true}",
    handler: async (a) => hideComment(str(a.commentId), a.hide !== false)
  },
  {
    name: "ig_delete_comment",
    description: "Delete an Instagram comment (Graph).",
    args: "{\"commentId\":\"...\"}",
    handler: async (a) => deleteComment(str(a.commentId))
  },
  {
    name: "ig_send_private_reply",
    description: "\"Comment INSURANCE and I'll DM you the link\" — sends a DM to whoever left a specific comment, even if they've never messaged the account. Meta's only sanctioned way to send a first DM to a stranger: one reply per comment ever, only within 7 days of the comment. Uses instagram_manage_comments (same permission ig_get_comments already needs), NOT the gated DM permission — call this directly, don't route it through ig_list_conversations or wait on DM approval. Typical flow: ig_get_comments to find the comment matching the trigger word, then this.",
    args: "{\"commentId\":\"...\",\"message\":\"...\"}",
    handler: async (a) => sendPrivateReplyToComment(str(a.commentId), str(a.message))
  },
  {
    name: "ig_list_conversations",
    description: "List Instagram DM conversations. Composio is primary; direct Graph (instagram-mcp) is fallback. Each provider's OAuth connection needs Meta messaging access.",
    args: "{}",
    handler: async () => withInstagramFallback(
      "ig_list_conversations",
      {
        composio: isComposioInstagramConnected() ? async () => composioListConversations() : undefined,
        graph: async () => listConversations()
      }
    )
  },
  {
    name: "ig_get_messages",
    description: "Read an Instagram DM thread.",
    args: "{\"conversationId\":\"...\"}",
    handler: async (a) => {
      const conversationId = str(a.conversationId);
      if (!conversationId) throw new Error("conversationId is required");
      return withInstagramFallback(
        "ig_get_messages",
        {
          composio: isComposioInstagramConnected() ? async () => composioGetMessages(conversationId) : undefined,
          graph: async () => getConversationMessages(conversationId)
        }
      );
    }
  },
  {
    name: "ig_send_dm",
    description: "Reply in an existing Instagram DM conversation. Meta requires a qualifying user interaction inside the 24-hour messaging window. Composio is primary; direct Graph is fallback. recipientId is the IGSID.",
    args: "{\"recipientId\":\"...\",\"text\":\"...\"}",
    handler: async (a) => {
      const recipientId = str(a.recipientId);
      const text = str(a.text || a.message);
      if (!recipientId || !text) throw new Error("recipientId and text are required");
      return withInstagramFallback(
        "ig_send_dm",
        {
          composio: isComposioInstagramConnected() ? async () => composioSendMessage(recipientId, text) : undefined,
          graph: async () => sendDirectMessage(recipientId, text)
        }
      );
    }
  },
  {
    name: "ig_publish",
    description: "Publish a public https media URL or library/video asset to Instagram (Reel/feed/story). Composio is primary, Graph (instagram-mcp) is fallback. Always report `via`.",
    args: "{\"mediaUrl\":\"/api/library/assets/.../file\",\"mediaType\":\"video/mp4\",\"caption\":\"...\",\"postType\":\"feed|story\",\"jobId\":\"optional\"}",
    handler: async (a) => publishInstagram({
      jobId: str(a.jobId) || null,
      mediaUrl: str(a.mediaUrl) || null,
      mediaType: str(a.mediaType) || null,
      caption: str(a.caption),
      postType: str(a.postType) === "story" ? "story" : "feed"
    })
  },
  {
    name: "steel_scrape",
    description: "Browse a public web page and return clean Markdown, metadata, and links. Tries Steel.dev first (supports an inline screenshot + a proxy), then falls back to Firecrawl, ScrapingBee, and Scrapfly in order if a provider fails or isn't configured — always reports which one actually served the page via `via`. Never use it for local/private URLs.",
    args: "{\"url\":\"https://example.com\",\"delayMs\":0,\"useProxy\":false,\"screenshot\":false}",
    handler: async (a) => {
      const attempts: { name: string; run: () => Promise<any> }[] = [
        { name: "steel.dev", run: () => scrapeWithSteel({ url: a.url, delayMs: a.delayMs, useProxy: a.useProxy, screenshot: a.screenshot }) },
        { name: "firecrawl", run: () => scrapeWithFirecrawl({ url: a.url }) },
        { name: "scrapingbee", run: () => scrapeWithScrapingBee({ url: a.url }) },
        { name: "scrapfly", run: () => scrapeWithScrapfly({ url: a.url }) }
      ];
      const errors: string[] = [];
      for (const attempt of attempts) {
        try {
          const result = await attempt.run();
          if (errors.length) result.fallbackNote = `Tried ${errors.length} provider(s) first: ${errors.join("; ")}`;
          return result;
        } catch (e) {
          errors.push(`${attempt.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      throw new Error(`steel_scrape failed on every provider. ${errors.join(" | ")}`);
    }
  },
  {
    name: "web_screenshot",
    description: "Take a real screenshot of a public URL (ScreenshotOne) and save it to the Library. Different from steel_scrape — this returns an image, not page content. Never use it for local/private URLs.",
    args: "{\"url\":\"https://example.com\",\"fullPage\":false}",
    handler: async (a) => takeScreenshot({ url: a.url, fullPage: a.fullPage })
  },
  {
    name: "web_search",
    description: "General web search (not a single-URL fetch) — ranked results with title/url/snippet across the whole web. Tries Exa first, falls back to Tavily. Use steel_scrape afterward on a specific result URL if you need the full page content.",
    args: "{\"query\":\"...\",\"numResults\":8}",
    handler: async (a) => webSearch({ query: str(a.query), numResults: num(a.numResults, 8) })
  },
  {
    name: "list_files",
    description: "Files uploaded into Claw.",
    args: "{\"conversationId\":\"optional\"}",
    handler: async (a) => ({ files: listFiles(str(a.conversationId) || null).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: f.url })) })
  },
  {
    name: "read_file",
    description: "Read a Claw file (text excerpt or metadata).",
    args: "{\"id\":\"...\"}",
    handler: async (a) => ({ id: str(a.id), text: await readClawFileText(str(a.id)) })
  },
  {
    name: "rename_file",
    description: "Rename a Claw file.",
    args: "{\"id\":\"...\",\"name\":\"...\"}",
    handler: async (a) => renameClawFile(str(a.id), str(a.name))
  },
  {
    name: "delete_file",
    description: "Delete a Claw file.",
    args: "{\"id\":\"...\"}",
    handler: async (a) => ({ ok: await deleteClawFile(str(a.id)) })
  },
  {
    name: "creator_upload_video",
    description: "Take one or more already-made videos attached to this chat (use Upload files first, then pass their file ids) and schedule them exactly like the Creator tab did: persist to the library, write one Calendar row per format. If caption is omitted, generates the same PI-compliant Case Closed FL branded caption Creator used to auto-generate.",
    args: "{\"fileIds\":[\"claw-file-id\"],\"subject\":\"optional, used to auto-generate caption\",\"caption\":\"optional, skips auto-generation if given\",\"formats\":\"reel,story,post\",\"scheduledAt\":\"optional ISO time, defaults to +1h\",\"network\":\"instagram\",\"autoPost\":true,\"category\":\"ugc\",\"title\":\"optional\"}",
    handler: async (a) => {
      const fileIds = Array.isArray(a.fileIds) ? a.fileIds.map((v) => String(v)) : a.fileId ? [str(a.fileId)] : [];
      if (!fileIds.length) throw new Error("fileIds is required — attach a video via Upload files first");
      const formats = parseCreatorFormats(str(a.formats));
      if (!formats.length) throw new Error("formats must include at least one of reel, story, post");
      const subject = str(a.subject);
      const category = str(a.category, "ugc");
      let caption = str(a.caption);
      if (!caption && subject) {
        const generated = await generateCreatorCaption({ subject, category, format: formats[0] });
        caption = generated.caption;
      }

      const uploaded: unknown[] = [];
      const failed: { name: string; error: string }[] = [];
      for (const fileId of fileIds) {
        const file = getClawFile(fileId);
        if (!file) { failed.push({ name: fileId, error: "No such Claw file — attach it with Upload files first" }); continue; }
        try {
          const bytes = await fsp.readFile(file.path);
          const result = await uploadAndScheduleCreatorVideo({
            bytes,
            fileName: file.name,
            mimeType: file.mime,
            title: str(a.title) || file.name,
            formats,
            scheduledAt: str(a.scheduledAt) || undefined,
            network: str(a.network, "instagram"),
            autoPost: a.autoPost !== false,
            caption,
            category
          });
          uploaded.push(result);
        } catch (e) {
          failed.push({ name: file.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (!uploaded.length) throw new Error(failed[0]?.error || "Upload failed");
      return { uploaded, failed, caption };
    }
  },
  {
    name: "list_seo_queue",
    description: "SEO Agent: list blog_posts drafts/generating/ready/failed for a site (or all sites), with SEO score.",
    args: "{\"siteId\":\"optional\",\"status\":\"optional pending|generating|ready|failed\",\"limit\":20}",
    handler: async (a) => {
      const limit = Math.max(1, Math.min(50, num(a.limit, 20)));
      const siteId = str(a.siteId);
      const status = str(a.status);
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (siteId) { clauses.push("site_id=?"); params.push(siteId); }
      if (status) { clauses.push("generation_status=?"); params.push(status); }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      params.push(limit);
      const rows = db.prepare(`SELECT id,site_id,title,slug,status,generation_status,generation_error,seo_score,seo_score_max,geo_score,scheduled_at FROM blog_posts ${where} ORDER BY scheduled_at ASC LIMIT ?`).all(...params);
      return { posts: rows };
    }
  },
  {
    name: "generate_blog_post",
    description: "SEO Agent: generate the full article body/meta/SEO-score for one queued blog_posts draft.",
    args: "{\"postId\":\"...\"}",
    handler: async (a) => {
      const postId = str(a.postId || a.id);
      if (!postId) throw new Error("postId is required");
      const post = await generateFullBlogPost(postId);
      return { id: post.id, title: post.title, generationStatus: post.generationStatus, seoScore: post.seoScore, seoScoreMax: post.seoScoreMax };
    }
  },
  {
    name: "publish_blog_post",
    description: "SEO Agent: publish one ready blog_posts article to its site's configured CMS (WordPress/Shopify/Webflow/webhook).",
    args: "{\"postId\":\"...\"}",
    handler: async (a) => {
      const postId = str(a.postId || a.id);
      const post = getBlogPost(postId);
      if (!post) throw new Error("Blog post not found");
      if (post.generationStatus !== "ready" || !post.bodyMarkdown) throw new Error(`Post is ${post.generationStatus}; generate it first`);
      const site = getSite(post.siteId);
      if (!site) throw new Error("Site not found");
      const result = await publishWebsite({
        siteId: post.siteId,
        title: post.title,
        content: post.bodyMarkdown,
        slug: post.slug,
        excerpt: post.excerpt,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        focusKeyword: post.focusKeyword,
        featuredImageUrl: post.imageUrl
      });
      return { id: postId, site: site.name, result };
    }
  },
  {
    name: "x_health",
    description: "Check whether X / Twitter is connected via Composio.",
    args: "{}",
    handler: async () => ({ connected: isXComposioConnected() })
  },
  {
    name: "x_post",
    description: "Post a tweet (text only — media attachment not wired yet).",
    args: "{\"text\":\"...\"}",
    handler: async (a) => composioPostTweet({ text: str(a.text) })
  },
  {
    name: "x_reply",
    description: "Reply to a tweet.",
    args: "{\"tweetId\":\"...\",\"text\":\"...\"}",
    handler: async (a) => composioReplyTweet(str(a.tweetId), str(a.text))
  },
  {
    name: "x_get_tweet",
    description: "Fetch one tweet by id.",
    args: "{\"tweetId\":\"...\"}",
    handler: async (a) => composioGetTweet(str(a.tweetId))
  },
  {
    name: "x_delete_tweet",
    description: "Delete a tweet.",
    args: "{\"tweetId\":\"...\"}",
    handler: async (a) => composioDeleteTweet(str(a.tweetId))
  },
  {
    name: "x_list_mentions",
    description: "Approximate recent mentions via a recent-search for @handle (X has no dedicated mentions action confirmed for this app).",
    args: "{\"handle\":\"yourhandle\"}",
    handler: async (a) => composioListMentions(str(a.handle))
  },
  {
    name: "linkedin_health",
    description: "Check whether LinkedIn is connected via Composio, and report the connected profile.",
    args: "{}",
    handler: async () => {
      const connected = isLinkedInComposioConnected();
      if (!connected) return { connected };
      try { return { connected, info: await composioGetMyInfo() }; } catch (e) { return { connected, error: e instanceof Error ? e.message : String(e) }; }
    }
  },
  {
    name: "linkedin_post",
    description: "Post a LinkedIn update (defaults to the connected person's profile; pass authorUrn for a company Page if that's what's connected).",
    args: "{\"text\":\"...\",\"authorUrn\":\"optional urn:li:organization:...\"}",
    handler: async (a) => composioPostUpdate({ text: str(a.text), authorUrn: str(a.authorUrn) || null })
  },
  {
    name: "linkedin_comment",
    description: "Comment on a LinkedIn post.",
    args: "{\"actorUrn\":\"...\",\"postUrn\":\"...\",\"message\":\"...\"}",
    handler: async (a) => composioCommentOnPost({ actorUrn: str(a.actorUrn), postUrn: str(a.postUrn), message: str(a.message) })
  },
  {
    name: "reddit_search_subreddits",
    description: "Search subreddits by name/topic.",
    args: "{\"query\":\"personalinjury\"}",
    handler: async (a) => composioSearchSubreddits(str(a.query))
  },
  {
    name: "reddit_submit_post",
    description: "Submit a Reddit post. Always report the pre-submit rules reminder — Reddit self-promotion rules are per-community and cannot be fully automated.",
    args: "{\"subreddit\":\"...\",\"title\":\"...\",\"text\":\"optional self-post body\",\"url\":\"optional link post URL\"}",
    handler: async (a) => {
      const subreddit = str(a.subreddit);
      if (!subreddit) throw new Error("subreddit is required");
      const reminder = redditPreSubmitReminder(subreddit);
      const result = await composioSubmitPost({ subreddit, title: str(a.title), text: str(a.text) || undefined, url: str(a.url) || undefined });
      return { ...result, reminder };
    }
  },
  {
    name: "reddit_list_comments",
    description: "List comments on a Reddit post.",
    args: "{\"postId\":\"base-36 article id\"}",
    handler: async (a) => composioRedditListComments(str(a.postId))
  },
  {
    name: "reddit_reply",
    description: "Reply to a Reddit post or comment (thingId is the fullname, e.g. t3_xxx or t1_xxx).",
    args: "{\"thingId\":\"...\",\"text\":\"...\"}",
    handler: async (a) => composioRedditReplyComment(str(a.thingId), str(a.text))
  },
  {
    name: "coding_new_session",
    description: "Coding Agent: open a new workspace on the configured external sandbox — either an operator-provisioned HTTP sandbox (CODING_SANDBOX_URL) or a hosted E2B sandbox (CODING_SANDBOX_PROVIDER=e2b + E2B_API_KEY). This app never executes code in its own process.",
    args: "{\"purpose\":\"optional\"}",
    handler: async (a) => {
      if (!isCodingSandboxConfigured()) throw new Error("No coding sandbox is configured. Point CODING_SANDBOX_URL at an operator-provisioned sandbox, or set CODING_SANDBOX_PROVIDER=e2b with E2B_API_KEY — this app never executes code in its own process.");
      return createCodingSession(str(a.purpose) || undefined);
    }
  },
  {
    name: "coding_run",
    description: "Coding Agent: run one shell command in a sandbox workspace. Every call is logged; output is scrubbed of this app's own secrets before it reaches you.",
    args: "{\"sessionId\":\"...\",\"workspaceRef\":\"...\",\"command\":\"npm test\"}",
    handler: async (a) => codingRunCommand({ sessionId: str(a.sessionId), workspaceRef: str(a.workspaceRef), command: str(a.command) })
  },
  {
    name: "coding_read_file",
    description: "Coding Agent: read a file from a sandbox workspace.",
    args: "{\"workspaceRef\":\"...\",\"path\":\"src/index.ts\"}",
    handler: async (a) => ({ content: await codingReadFile({ workspaceRef: str(a.workspaceRef), path: str(a.path) }) })
  },
  {
    name: "coding_write_file",
    description: "Coding Agent: write a file in a sandbox workspace.",
    args: "{\"workspaceRef\":\"...\",\"path\":\"src/index.ts\",\"content\":\"...\"}",
    handler: async (a) => codingWriteFile({ workspaceRef: str(a.workspaceRef), path: str(a.path), content: str(a.content) })
  },
  {
    name: "coding_list_files",
    description: "Coding Agent: list files in a sandbox workspace directory.",
    args: "{\"workspaceRef\":\"...\",\"path\":\"optional, defaults to .\"}",
    handler: async (a) => ({ files: await codingListFiles({ workspaceRef: str(a.workspaceRef), path: str(a.path) || undefined }) })
  },
  {
    name: "discover_influencers",
    description: "Influencer Agent: discover creators either by public Instagram username (first-party Graph business_discovery, no scraping) or from one operator-supplied public URL (Steel + AI extraction of that single page's listed creators).",
    args: "{\"mode\":\"instagram\",\"username\":\"...\"} OR {\"mode\":\"url\",\"sourceUrl\":\"https://...\",\"nicheHint\":\"optional\"}",
    handler: async (a) => {
      const mode = str(a.mode, "instagram");
      if (mode === "instagram") {
        const username = str(a.username);
        if (!username) throw new Error("username is required");
        return { influencer: await discoverByInstagramUsername(username) };
      }
      if (mode === "url") {
        const sourceUrl = str(a.sourceUrl);
        if (!sourceUrl) throw new Error("sourceUrl is required");
        return discoverFromUrl({ sourceUrl, nicheHint: str(a.nicheHint) || null });
      }
      throw new Error("mode must be instagram or url");
    }
  },
  {
    name: "list_influencers",
    description: "List tracked influencers, optionally by status.",
    args: "{\"status\":\"optional prospect|contacted|negotiating|active|declined\"}",
    handler: async (a) => ({ influencers: listInfluencers(str(a.status) || undefined) })
  },
  {
    name: "update_influencer_status",
    description: "Update an influencer's pipeline status and/or notes.",
    args: "{\"id\":\"...\",\"status\":\"contacted\",\"notes\":\"optional\"}",
    handler: async (a) => {
      const influencer = updateInfluencerStatus(str(a.id), str(a.status), a.notes !== undefined ? str(a.notes) : undefined);
      if (!influencer) throw new Error("Influencer not found");
      return { influencer };
    }
  },
  {
    name: "send_influencer_outreach",
    description: "Draft (and send, for email) an outreach message to a tracked influencer. Instagram DM is draft-only unless an active-conversation IGSID is supplied — Instagram's API cannot cold-message a stranger.",
    args: "{\"id\":\"...\",\"channel\":\"email|instagram_dm\",\"brandContext\":\"optional\",\"proposal\":\"optional\",\"emailFrom\":\"optional verified sender\",\"instagramIgsid\":\"optional\"}",
    handler: async (a) => sendOutreach({
      influencerId: str(a.id),
      channel: str(a.channel) === "email" ? "email" : "instagram_dm",
      brandContext: str(a.brandContext) || null,
      proposal: str(a.proposal) || null,
      emailFrom: str(a.emailFrom) || undefined,
      instagramIgsid: str(a.instagramIgsid) || null
    })
  },
  {
    name: "audit_website",
    description: "Website Analysis Agent: crawl a connected site (or any public URL) and score technical SEO + GEO readiness + content gaps + conversion notes.",
    args: "{\"siteId\":\"site id, or a raw https:// URL\"}",
    handler: async (a) => {
      const target = str(a.siteId || a.url);
      if (!target) throw new Error("siteId or url is required");
      return auditWebsite(target);
    }
  },
  {
    name: "list_strategies",
    description: "Strategies Agent: list saved cross-channel marketing strategies (optionally for one site).",
    args: "{\"siteId\":\"optional\"}",
    handler: async (a) => ({ strategies: listStrategies(str(a.siteId) || undefined) })
  },
  {
    name: "generate_strategy",
    description: "Strategies Agent: generate a cross-channel marketing strategy (goals, channel mix, content pillars) as a draft.",
    args: "{\"title\":\"Q1 growth plan\",\"horizon\":\"monthly\",\"siteId\":\"optional\"}",
    handler: async (a) => {
      const title = str(a.title);
      if (!title) throw new Error("title is required");
      const horizon = ["weekly", "monthly", "quarterly"].includes(str(a.horizon)) ? str(a.horizon) as "weekly" | "monthly" | "quarterly" : "monthly";
      const channels: string[] = [];
      if (isInstagramConfigured()) channels.push("instagram");
      if (isYouTubeConnected()) channels.push("youtube");
      const rows = db.prepare("SELECT DISTINCT toolkit FROM connected_accounts WHERE UPPER(status)='ACTIVE'").all() as { toolkit: string }[];
      for (const r of rows) if (!channels.includes(r.toolkit)) channels.push(r.toolkit);
      const plan = await planStrategy({ title, horizon, siteContext: str(a.siteContext) || null, auditSummary: str(a.auditSummary) || null, liveChannels: channels, recentPerformanceSummary: str(a.recentPerformanceSummary) || null });
      const strategy = createStrategy({ siteId: str(a.siteId) || null, title, horizon, goals: plan.goals, channelMix: plan.channelMix, contentPillars: plan.contentPillars, rationale: plan.rationale, model: "nvidia" });
      return { strategy };
    }
  },
  {
    name: "approve_strategy",
    description: "Strategies Agent: mark a draft strategy approved.",
    args: "{\"id\":\"...\"}",
    handler: async (a) => {
      const id = str(a.id);
      const strategy = updateStrategy(id, { status: "approved" });
      if (!strategy) throw new Error("Strategy not found");
      return { strategy };
    }
  },
  {
    name: "generate_geo_schema",
    description: "GEO Agent: extract FAQ pairs + key citable facts from a ready blog post, build JSON-LD, and score it for AI-answer-engine citability.",
    args: "{\"postId\":\"...\"}",
    handler: async (a) => {
      const postId = str(a.postId || a.id);
      if (!postId) throw new Error("postId is required");
      const result = await generateGeoForPost(postId);
      return { id: postId, faqCount: result.post.geoFaq.length, geoScore: result.score, geoMaxScore: result.maxScore, schema: result.schema };
    }
  },
  {
    name: "get_llms_txt",
    description: "GEO Agent: build the llms.txt manifest (site summary + published article URLs + key facts) for a site.",
    args: "{\"siteId\":\"...\"}",
    handler: async (a) => {
      const siteId = str(a.siteId);
      if (!siteId) throw new Error("siteId is required");
      return { llmsTxt: buildLlmsTxt(siteId) };
    }
  },
  {
    name: "write_post",
    description: "AI Content Writer: draft ready-to-post copy for one platform (instagram, facebook, youtube, tiktok, x, linkedin, reddit). Does not post or save anything.",
    args: "{\"topic\":\"...\",\"platform\":\"linkedin\",\"tone\":\"optional\"}",
    handler: async (a) => {
      const platform = str(a.platform, "instagram");
      if (!isPlatformKey(platform)) throw new Error(`platform must be one of ${PLATFORM_KEYS.join(", ")}`);
      const topic = str(a.topic || a.subject);
      if (!topic) throw new Error("topic is required");
      const copy = await writeStandalonePost({ topic, platform, tone: str(a.tone) || null, siteContext: str(a.siteContext) || null });
      return { platform, copy };
    }
  },
  {
    name: "save_post",
    description: "Save AI-written or operator-written copy as a draft Calendar item (no auto-post). Use after write_post if the operator wants to keep it.",
    args: "{\"platform\":\"linkedin\",\"title\":\"...\",\"body\":\"...\",\"scheduledAt\":\"optional ISO time\"}",
    handler: async (a) => {
      const platform = str(a.platform, "instagram");
      if (!isPlatformKey(platform)) throw new Error(`platform must be one of ${PLATFORM_KEYS.join(", ")}`);
      const body = str(a.body || a.primaryText || a.caption);
      if (!body) throw new Error("body is required");
      const title = str(a.title, body.slice(0, 80));
      const scheduledAt = str(a.scheduledAt) || new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO scheduled_posts(
          id, title, network, scheduled_at, status, auto_post, caption,
          content_type, media_url, media_type, source_asset_key,
          site_id, campaign_id, planning_horizon_days, generation_status, category
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(id, title.slice(0, 180), platform, scheduledAt, "draft", 0, body.slice(0, 5000), "text-post", null, null, null, null, null, null, "ready", str(a.category, "ugc"));
      return { id, platform, title, scheduledAt, status: "draft" };
    }
  },
  {
    name: "draft_caption",
    description: "Draft PI-safe Instagram caption. Does not post.",
    args: "{\"topic\":\"...\",\"network\":\"instagram\"}",
    handler: async (a) => ({
      caption: `${str(a.topic || a.mission).slice(0, 400)}\n\nQuestions after an accident? Call. This is advertising, not legal advice.`.slice(0, 2200),
      note: "PI-safe draft. No fake results. Confirm before posting."
    })
  }
];

export const CLAW_TOOL_MAP = new Map(CLAW_TOOLS.map((t) => [t.name, t]));

export function toolsCatalog(): string {
  return CLAW_TOOLS.map((t) => `- ${t.name} ${t.args} — ${t.description}`).join("\n");
}

export async function executeClawTool(name: string, args: Record<string, unknown>) {
  const tool = CLAW_TOOL_MAP.get(name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  const data = await tool.handler(args);
  return typeof data === "string" ? data : clip(data, 6000);
}
