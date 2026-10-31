/* =============================================================================
   ALTRAZ — front-end only app (React + Tailwind + lucide-react)
   No backend, no database, no login. Data lives in the visitor's browser
   (localStorage), so it runs on any static host.

   AI: Groq + live lookups from Currents news, Wikipedia and Wikinews.
   Keys are read from environment variables at build time (see .env.example):
     VITE_GROQ_KEYS     comma-separated Groq keys  (https://console.groq.com/keys)
     VITE_CURRENTS_KEY  Currents news key          (https://currentsapi.services)
   ============================================================================= */
import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowUp, Brain, CheckCircle,
  ChevronDown, Clock, ExternalLink, Eye, FileText, Globe2, Heart, Info,
  Link2, Menu, MessageCircle, Newspaper, Play, Radar, RotateCcw, Search,
  Settings, Shield, ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, Star,
  Target, Users, X, Youtube, Zap,
} from "lucide-react";

/* ============================================================ 1. CONFIG === */
const envList = (v) => String(v || "").split(",").map((k) => k.trim()).filter(Boolean);
const CONFIG = {
  // Comma-separated list in VITE_GROQ_KEYS (add more keys to multiply capacity).
  groqKeys: envList(import.meta.env.VITE_GROQ_KEYS),
  groqModels: ["openai/gpt-oss-120b", "qwen/qwen3-32b", "openai/gpt-oss-20b"],
  // Free Currents news search key (250 searches/day). Optional.
  currentsKey: import.meta.env.VITE_CURRENTS_KEY || "",
};

/* ============================================================ 2. HELPERS === */
const ls = {
  get: (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n) => Math.max(0, Math.min(100, typeof n === "number" ? n : 50));
const day = 86400000;

const ago = (ts) => {
  const s = Math.max(1, Math.floor((Date.now() - (ts || Date.now())) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 2592000)}mo ago`;
};
const longDate = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const extractYouTubeId = (url = "") => {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
};
const youtubeThumb = (url) => { const id = extractYouTubeId(url); return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ""; };
const detectPlatform = (url = "") => {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/instagram\.com/.test(u)) return "instagram";
  if (/facebook\.com|fb\.watch|fb\.com/.test(u)) return "facebook";
  if (/x\.com|twitter\.com/.test(u)) return "x";
  if (/tiktok\.com/.test(u)) return "tiktok";
  return "other";
};

/* ============================================================ 3. VOCABULARY */
const PLATFORMS = ["Facebook", "X (Twitter)", "Instagram", "Reddit", "General"];
const CATEGORIES = ["Politics", "Health", "Technology", "Science", "Entertainment", "Finance", "World", "Other"];
const VERDICTS = ["Fake", "Misleading", "Unverified", "Partially True", "True"];
const YT_VERDICTS = ["Scam", "Misleading", "Clickbait", "Legitimate"];
const FWD_VERDICTS = [...VERDICTS, "Scam", "Hoax"];
const REGIONS = ["Global", "North America", "Europe", "Asia", "Middle East", "Africa", "South America", "Oceania"];
const INTERESTS = ["Politics", "Health", "Technology", "Science", "Entertainment", "Finance", "World", "Sports"];
const COUNTS = [1, 2, 3, 4, 5];

const VERDICT_META = {
  Fake: ["bg-red-50", "text-red-700", "border-red-200", ShieldAlert],
  Misleading: ["bg-orange-50", "text-orange-700", "border-orange-200", AlertTriangle],
  Unverified: ["bg-yellow-50", "text-yellow-800", "border-yellow-200", ShieldQuestion],
  "Partially True": ["bg-blue-50", "text-blue-700", "border-blue-200", ShieldCheck],
  True: ["bg-emerald-50", "text-emerald-700", "border-emerald-200", CheckCircle],
  Scam: ["bg-red-50", "text-red-700", "border-red-200", ShieldAlert],
  Hoax: ["bg-red-50", "text-red-700", "border-red-200", ShieldAlert],
  Clickbait: ["bg-purple-50", "text-purple-700", "border-purple-200", AlertTriangle],
  Legitimate: ["bg-emerald-50", "text-emerald-700", "border-emerald-200", CheckCircle],
};
const PLATFORM_META = {
  Facebook: ["bg-blue-100", "text-blue-700", "FB"],
  "X (Twitter)": ["bg-slate-200", "text-slate-800", "𝕏"],
  Instagram: ["bg-pink-100", "text-pink-600", "IG"],
  Reddit: ["bg-orange-100", "text-orange-600", "R"],
  General: ["bg-slate-100", "text-slate-600", "WEB"],
};
const SOURCES = [["BBC News", "bbc.com"], ["Reuters", "reuters.com"], ["AP News", "apnews.com"], ["AFP", "afp.com"],
  ["NDTV", "ndtv.com"], ["Al Jazeera", "aljazeera.com"], ["CNN", "cnn.com"], ["The Guardian", "theguardian.com"],
  ["DW", "dw.com"], ["Bloomberg", "bloomberg.com"], ["The Hindu", "thehindu.com"], ["Alt News", "altnews.in"],
  ["BOOM", "boomlive.in"], ["Snopes", "snopes.com"], ["PolitiFact", "politifact.com"], ["Reddit", "reddit.com"]];

/* ============================================================ 4. SEED DATA */
const seedArticle = (a) => ({
  id: uid(), created: Date.now() - day * (a.days || 1), engagement_count: a.engagement || 0,
  credibility_score: clamp(a.credibility_score), original_source: a.original_source || "",
  fact_check_sources: a.fact_check_sources || "Cross-checked against wire services and fact-checkers",
  analysis: a.analysis || "", region: a.region || "Global", source_platform: a.source_platform,
  category: a.category, verdict: a.verdict, title: a.title, summary: a.summary,
});
const SEED_ARTICLES = [
  seedArticle({ days: 3, title: "COVID-19 Vaccine Linked to Male Infertility, Study Claims", summary: "A viral post on Facebook claims a new study shows the COVID-19 vaccine causes infertility in men.", source_platform: "Facebook", category: "Health", verdict: "Fake", credibility_score: 15, engagement: 18400,
    analysis: "No peer-reviewed study supports a link between COVID-19 vaccination and male infertility. Fertility societies and independent fact-checkers have repeatedly debunked this claim; the original post cites a non-existent paper.", original_source: "facebook.com/post/viral-claim" }),
  seedArticle({ days: 2, title: "U.S. Senate Passes Nationwide TikTok Ban", summary: "A Facebook meme asserts that the U.S. Senate has enacted a law banning TikTok across the country.", source_platform: "Facebook", category: "Politics", verdict: "Fake", credibility_score: 22, engagement: 9600,
    analysis: "The post misstates a bill's status: legislation was debated, but no signed law bans the app for all users. The meme quotes a headline from a satirical page.", original_source: "facebook.com/meme/tiktok-ban" }),
  seedArticle({ days: 1, title: "Apple to Launch iPhone with Built-in Crypto Wallet Next Month", summary: "A trending tweet claims Apple will release an iPhone featuring a native cryptocurrency wallet in September.", source_platform: "X (Twitter)", category: "Technology", verdict: "Misleading", credibility_score: 44, engagement: 12300,
    analysis: "Apple has added wallet-related developer APIs, but no announcement confirms a built-in crypto wallet. The tweet merges an old patent filing with an unrelated launch date.", original_source: "x.com/tech-rumors/status/1" }),
  seedArticle({ days: 4, title: "Drinking Hot Lemon Water Kills 99% of Viruses, Doctors Say", summary: "An Instagram reel credits unnamed doctors with proving hot lemon water eliminates viral infections.", source_platform: "Instagram", category: "Health", verdict: "Fake", credibility_score: 9, engagement: 41200,
    analysis: "No medical body endorses this. Hydration and vitamin C do not kill viruses; the reel reuses a script already flagged by multiple fact-checkers.", original_source: "instagram.com/reel/hot-lemon" }),
  seedArticle({ days: 5, title: "Government to Seize Unused Bank Deposits Above 1 Lakh", summary: "A Reddit post warns savers that idle balances will be transferred to a national fund.", source_platform: "Reddit", category: "Finance", verdict: "Fake", credibility_score: 12, engagement: 7300,
    analysis: "The claim twists a dormant-account rule that applies only to accounts untouched for a decade, and no seizure of active deposits exists in law.", original_source: "reddit.com/r/india/comments/x" }),
  seedArticle({ days: 6, title: "Study Finds 5G Towers Cause Migratory Bird Collapse", summary: "A widely shared article ties a bird population drop to 5G rollout in coastal cities.", source_platform: "General", category: "Science", verdict: "Unverified", credibility_score: 33, engagement: 5100,
    analysis: "The cited report is not peer-reviewed and its data window predates the 5G rollout it blames. Independent ecologists attribute the decline to habitat loss.", original_source: "unknown-blog.example/5g-birds" }),
];
const seedVideo = (v) => ({
  id: uid(), created: Date.now() - day * (v.days || 1), title: v.title, summary: v.summary,
  channel_name: v.channel, video_url: v.url, thumbnail_url: youtubeThumb(v.url),
  category: v.category, verdict: v.verdict, analysis: v.analysis, engagement_count: v.engagement || 0, region: "Global",
});
const SEED_VIDEOS = [
  seedVideo({ days: 2, title: "Get Rich in 7 Days — Guaranteed Crypto Returns", channel: "Wealth Rocket", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", category: "Finance", verdict: "Scam", engagement: 240000,
    analysis: "The video promises fixed returns and asks viewers to send funds to a private wallet — a classic advance-fee pattern. The channel has no corporate identity and disables comments." }),
  seedVideo({ days: 3, title: "Doctors HATE This One Trick to Reverse Diabetes", channel: "Health Secrets HQ", url: "https://www.youtube.com/watch?v=9bZkp7q19f0", category: "Health", verdict: "Misleading", engagement: 880000,
    analysis: "The clip repackages a supplement advert as medical advice, uses a fake 'banned remedy' hook, and cites no trials. Nothing in it replaces clinical care." }),
  seedVideo({ days: 5, title: "SHOCKING: Politician Caught on Camera (Must See)", channel: "Truth Drop", url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk", category: "Politics", verdict: "Clickbait", engagement: 1500000,
    analysis: "The thumbnail and title promise footage that never appears. The video is a stitched montage of unrelated clips with no sourcing." }),
];

/* ============================================================ 5. AI LAYER */
const cooldown = new Map();

function keyPool() {
  let extra = [];
  try { extra = (localStorage.getItem("altraz_extra_keys") || "").split(",").map((k) => k.trim()).filter(Boolean); } catch {}
  const keys = [...CONFIG.groqKeys, ...extra].filter(Boolean);
  if (!keys.length) throw new Error("NO_AI_KEY");
  const warm = keys.filter((k) => (cooldown.get(k) || 0) < Date.now());
  return warm.length ? warm : keys;
}

async function groqOnce(model, key, prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.4, max_tokens: 8000 }),
  });
  if (!res.ok) {
    if (res.status === 429) { cooldown.set(key, Date.now() + 60000); throw new Error("RATE_LIMITED"); }
    if (res.status === 401 || res.status === 403) throw new Error("INVALID_API_KEY");
    if (res.status === 400 || res.status === 404) throw new Error("MODEL_UNAVAILABLE");
    throw new Error("AI_ERROR");
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("AI_EMPTY_RESPONSE");
  return text;
}

const parseJson = (text = "") => {
  const tries = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], (text.match(/\{[\s\S]*\}/) || [])[0]];
  for (const t of tries) { if (!t) continue; try { return JSON.parse(t); } catch {} }
  return null;
};

async function currentsSearch(query) {
  if (!CONFIG.currentsKey) return "";
  try {
    const res = await fetch(`https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(query)}&language=en&page_size=8`,
      { headers: { Authorization: `Bearer ${CONFIG.currentsKey}` } });
    if (!res.ok) return "";
    const data = await res.json();
    return (data.news || []).filter((a) => a.title)
      .map((a) => `- ${a.title}${a.description ? `: ${String(a.description).slice(0, 200)}` : ""}`).join("\n");
  } catch { return ""; }
}

async function wikiTitles(base, query) {
  try {
    const res = await fetch(`${base}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=3`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.query?.search || []).map((s) => s.title);
  } catch { return []; }
}
async function wikiExtract(base, title) {
  try {
    const res = await fetch(`${base}?action=query&prop=extracts&exintro=1&explaintext=1&format=json&origin=*&titles=${encodeURIComponent(title)}`);
    if (!res.ok) return "";
    const data = await res.json();
    const page = Object.values(data.query?.pages || {})[0];
    return (page?.extract || "").slice(0, 900);
  } catch { return ""; }
}

async function webLookup(query) {
  const clean = String(query || "").slice(0, 200).trim();
  if (!clean) return "";
  const parts = [];
  const [news, wiki, wikinews] = await Promise.all([
    currentsSearch(clean),
    wikiTitles("https://en.wikipedia.org/w/api.php", clean),
    wikiTitles("https://en.wikinews.org/w/api.php", clean),
  ]);
  if (news) parts.push(`LIVE NEWS on this topic:\n${news}`);
  if (wikinews.length) parts.push(`Recent Wikinews coverage:\n${wikinews.map((t) => `- ${t}`).join("\n")}`);
  for (const title of wiki.slice(0, 2)) {
    const text = await wikiExtract("https://en.wikipedia.org/w/api.php", title);
    if (text) parts.push(`Wikipedia — ${title}:\n${text}`);
  }
  return parts.join("\n\n");
}

/* User ratings become the AI's learning memory. */
function memoryText() {
  const list = ls.get("altraz_feedback", []).slice(0, 10);
  if (!list.length) return "";
  const avg = list.reduce((s, f) => s + (f.rating || 0), 0) / list.length;
  const lines = list.map((f) => `- "${f.title}" was rated ${f.rating}/5 as "${f.verdict}"${f.correction ? ` — user says it should be "${f.correction}"` : ""}${f.note ? ` (note: ${f.note})` : ""}`);
  return `LEARNING MEMORY — user feedback on your past verdicts (avg ${avg.toFixed(1)}/5). Treat corrections as ground truth and calibrate:\n${lines.join("\n")}\n\n`;
}

async function aiJson(prompt, searchQuery) {
  const mem = memoryText();
  let ctx = "";
  if (searchQuery) {
    const found = await webLookup(searchQuery);
    if (found) ctx = `LIVE WEB LOOKUP (retrieved just now — trust it over your memory, cite outlets in "fact_check_sources"):\n${found}\n\n`;
  }
  let last = "AI_ERROR";
  for (const model of CONFIG.groqModels) {
    for (const key of keyPool()) {
      try {
        const out = parseJson(await groqOnce(model, key, mem + ctx + prompt));
        if (out) return out;
        last = "PARSE_FAILED";
      } catch (err) {
        last = err.message;
        if (err.message === "MODEL_UNAVAILABLE") break;
        if (["RATE_LIMITED", "INVALID_API_KEY", "AI_EMPTY_RESPONSE"].includes(err.message)) continue;
        throw err;
      }
    }
  }
  throw new Error(last);
}

const AI_ERRORS = {
  NO_AI_KEY: "The AI isn't connected yet — add a free Groq API key (VITE_GROQ_KEYS) and rebuild.",
  INVALID_API_KEY: "The AI key was rejected — check the Groq key in VITE_GROQ_KEYS.",
  RATE_LIMITED: "Too many requests right now. Wait a minute and try again.",
  PARSE_FAILED: "The AI reply couldn't be read. Please try again.",
  MODEL_UNAVAILABLE: "No AI model was available. Please try again.",
};
const aiMessage = (err) => AI_ERRORS[err?.message] || "Something went wrong. Please try again.";

const jsonPrompt = (body, shape) => `${body}\n\nRespond with ONLY valid JSON (no markdown, no code blocks):\n${shape}`;

async function checkLink(url) {
  const r = await aiJson(jsonPrompt(
    `You are a professional fact-checker. A user shared this link: ${url}\nInvestigate the content and its claims. Decide if it is true, false or misleading.`,
    `{"verdict":"Fake|Misleading|Unverified|Partially True|True","credibility_score":0-100,"title":"the main claim or headline","summary":"1-2 sentences","analysis":"3-4 sentences with evidence","fact_check_sources":"sources that verify or debunk this"}`), url);
  return {
    kind: "Link", url, verdict: VERDICTS.includes(r.verdict) ? r.verdict : "Unverified",
    credibility_score: clamp(r.credibility_score), title: r.title || url, summary: r.summary || "",
    analysis: r.analysis || "", fact_check_sources: r.fact_check_sources || "",
  };
}

async function checkForward(text) {
  const r = await aiJson(jsonPrompt(
    `You are a fact-checker specialising in WhatsApp forwards and viral messages. The user received:\n"${text}"\nCheck its claims against fact-checkers, hoax databases and community discussion.`,
    `{"verdict":"Fake|Misleading|Unverified|Partially True|True|Scam|Hoax","credibility_score":0-100,"title":"the main claim in 5-10 words","summary":"1-2 sentences","analysis":"3-4 sentences with evidence","fact_check_sources":"sources","is_known_hoax":true,"hoax_type":"phishing|health misinformation|political|financial scam|or empty"}`), text.slice(0, 150));
  return {
    kind: "Forward", verdict: FWD_VERDICTS.includes(r.verdict) ? r.verdict : "Unverified",
    credibility_score: clamp(r.credibility_score), title: r.title || "Forwarded message", summary: r.summary || "",
    analysis: r.analysis || "", fact_check_sources: r.fact_check_sources || "",
    is_known_hoax: Boolean(r.is_known_hoax), hoax_type: r.hoax_type || "",
  };
}

async function checkVideo(url, platform) {
  const label = platform === "youtube" ? "YouTube video" : platform === "instagram" ? "Instagram reel"
    : platform === "facebook" ? "Facebook video" : platform === "x" ? "X video" : platform === "tiktok" ? "TikTok video" : "online video";
  const r = await aiJson(jsonPrompt(
    `You are a fact-checker and scam detector. The user shared this ${label}: ${url}\nInvestigate its claims. Decide if it is true, false, misleading, a scam or clickbait.`,
    `{"verdict":"Fake|Misleading|Unverified|Partially True|True|Scam|Clickbait|Legitimate","credibility_score":0-100,"title":"the main claim of the video","summary":"1-2 sentences","analysis":"3-4 sentences with evidence","fact_check_sources":"sources"}`), url);
  const all = [...VERDICTS, ...YT_VERDICTS];
  return {
    kind: "Video", url, platform, verdict: all.includes(r.verdict) ? r.verdict : "Unverified",
    credibility_score: clamp(r.credibility_score), title: r.title || url, summary: r.summary || "",
    analysis: r.analysis || "", fact_check_sources: r.fact_check_sources || "",
  };
}

async function scanNews({ region, count, interests }) {
  const hint = interests?.length ? `Prioritise these topics: ${interests.join(", ")}.` : "";
  const r = await aiJson(jsonPrompt(
    `You are a misinformation analyst. Find the latest fake news and misleading claims circulating on social media in region: ${region}. ${hint}
Find exactly ${count} distinct stories for EACH of these platforms: Facebook, X (Twitter), Instagram, Reddit (${count * 4} total).`,
    `{"articles":[{"title":"...","summary":"1-2 sentences","source_platform":"Facebook|X (Twitter)|Instagram|Reddit","category":"Politics|Health|Technology|Science|Entertainment|Finance|World|Other","credibility_score":0-100,"verdict":"Fake|Misleading|Unverified|Partially True","analysis":"2-3 sentences","original_source":"...","fact_check_sources":"...","engagement_count":0}]}`),
    `${region} misinformation fact check`);
  return (r.articles || []).map((a) => ({
    id: uid(), created: Date.now(), region, scan_batch: uid(),
    title: a.title || "Untitled", summary: a.summary || "",
    source_platform: ["Facebook", "X (Twitter)", "Instagram", "Reddit"].includes(a.source_platform) ? a.source_platform : "Facebook",
    category: CATEGORIES.includes(a.category) ? a.category : "Other",
    credibility_score: clamp(a.credibility_score), verdict: VERDICTS.includes(a.verdict) ? a.verdict : "Unverified",
    analysis: a.analysis || "", original_source: a.original_source || "",
    fact_check_sources: a.fact_check_sources || "", engagement_count: a.engagement_count || 0,
  }));
}

async function scanYouTube({ region, count }) {
  const r = await aiJson(jsonPrompt(
    `You are a scam detection analyst. Find ${count} distinct scam, fraudulent, misleading or clickbait YouTube videos in region: ${region}. Give the real video URL (youtube.com/watch?v=...).`,
    `{"videos":[{"title":"...","summary":"1-2 sentences","channel_name":"...","video_url":"full YouTube URL","category":"Politics|Health|Technology|Science|Entertainment|Finance|World|Other","verdict":"Scam|Misleading|Clickbait","analysis":"2-3 sentences","engagement_count":0}]}`),
    `${region} viral scam video`);
  return (r.videos || []).map((v) => ({
    id: uid(), created: Date.now(), region, scan_batch: uid(),
    title: v.title || "Untitled", summary: v.summary || "", channel_name: v.channel_name || "Unknown",
    video_url: v.video_url || "", thumbnail_url: youtubeThumb(v.video_url),
    category: CATEGORIES.includes(v.category) ? v.category : "Other",
    verdict: YT_VERDICTS.includes(v.verdict) ? v.verdict : "Misleading",
    analysis: v.analysis || "", engagement_count: v.engagement_count || 0,
  }));
}

/* ============================================================ 6. STORE === */
const StoreCtx = createContext(null);
const useStore = () => useContext(StoreCtx);

function StoreProvider({ children }) {
  const [articles, setArticles] = useState(() => ls.get("altraz_articles", SEED_ARTICLES));
  const [videos, setVideos] = useState(() => ls.get("altraz_videos", SEED_VIDEOS));
  const [feedback, setFeedback] = useState(() => ls.get("altraz_feedback", []));
  const [prefs, setPrefs] = useState(() => ls.get("altraz_prefs", { name: "Altraz User", interests: [] }));

  useEffect(() => { ls.set("altraz_articles", articles); }, [articles]);
  useEffect(() => { ls.set("altraz_videos", videos); }, [videos]);
  useEffect(() => { ls.set("altraz_feedback", feedback); }, [feedback]);
  useEffect(() => { ls.set("altraz_prefs", prefs); }, [prefs]);

  const value = {
    articles, videos, feedback, prefs,
    savePrefs: (patch) => setPrefs((p) => ({ ...p, ...patch })),
    addArticles: (list) => setArticles((prev) => [...list, ...prev].slice(0, 300)),
    addVideos: (list) => setVideos((prev) => [...list, ...prev].slice(0, 200)),
    addFeedback: (f) => setFeedback((prev) => [{ ...f, id: uid(), created: Date.now() }, ...prev].slice(0, 200)),
    resetAll: () => { setArticles(SEED_ARTICLES); setVideos(SEED_VIDEOS); setFeedback([]); },
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/* ============================================================ 7. TOASTS === */
const ToastCtx = createContext(null);
const useToast = () => useContext(ToastCtx) || { push: () => {} };

/* ============================================================ 8. UI ATOMS */
function Btn({ variant = "solid", size = "md", className = "", ...props }) {
  const variants = {
    solid: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
    outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  const sizes = { sm: "h-9 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-sm" };
  return <button className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30";

function Select({ value, onChange, options, label, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>}
      <span className="relative block">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-2.5 pr-8 text-sm text-slate-700 focus:border-rose-400 focus:outline-none">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );
}
const opt = (list) => list.map((v) => ({ value: v, label: v }));

function Pop({ button, children, width = "w-64" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      {React.cloneElement(button, { onClick: () => setOpen((o) => !o) })}
      {open && <div className={`absolute right-0 z-50 mt-2 ${width} rounded-2xl border border-slate-200 bg-white p-4 shadow-xl`}>{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-slate-300"}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function Loader({ label = "Searching the web..." }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
        <span className="absolute inset-0 animate-ping rounded-full bg-rose-100" />
        <Search className="relative h-6 w-6 text-rose-600" />
      </div>
      <div className="h-1.5 w-44 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full w-1/3 animate-[slide_1.5s_ease-in-out_infinite] rounded-full bg-rose-600" />
      </div>
      {label && <p className="text-xs text-slate-500">{label}</p>}
    </div>
  );
}

function VerdictBadge({ verdict, size = "sm" }) {
  const [bg, fg, border, Icon] = VERDICT_META[verdict] || VERDICT_META.Unverified;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${bg} ${fg} ${border} ${size === "lg" ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-xs"}`}>
      <Icon className={size === "lg" ? "h-4 w-4" : "h-3 w-3"} />
      {verdict}
    </span>
  );
}

function Meter({ score }) {
  const s = clamp(score);
  const [color, label] = s > 80 ? ["bg-emerald-500", "High"] : s > 60 ? ["bg-blue-500", "Moderate"]
    : s > 40 ? ["bg-yellow-500", "Low"] : s > 20 ? ["bg-orange-500", "Very Low"] : ["bg-red-500", "Very Low"];
  return (
    <div className="flex min-w-[140px] items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${s}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs font-medium text-slate-500">{s}% — {label}</span>
    </div>
  );
}

function PlatformTag({ platform, showLabel }) {
  const [bg, fg, label] = PLATFORM_META[platform] || PLATFORM_META.General;
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold ${bg} ${fg}`}>{label}</span>
      {showLabel && <span className="text-xs text-slate-500">{platform}</span>}
    </span>
  );
}

function SourceTicker() {
  const row = [...SOURCES, ...SOURCES];
  return (
    <section className="border-b border-slate-200 bg-slate-50 py-5">
      <div className="mx-auto mb-3 flex max-w-7xl items-center justify-center gap-2 px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Newspaper className="h-3.5 w-3.5" /> Trusted sources we check claims against
      </div>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-slate-50 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-slate-50 to-transparent" />
        <div className="flex w-max animate-[ticker_38s_linear_infinite] gap-3 px-3 hover:[animation-play-state:paused]">
          {row.map(([name, domain], i) => (
            <div key={`${domain}-${i}`} title={name} className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
              <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={name} title={name} loading="lazy" className="h-5 w-5 rounded-sm object-contain" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top"
      className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg hover:-translate-y-0.5 hover:bg-slate-50">
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

/* Rating box — saved locally and fed back into the AI as learning memory. */
function FeedbackBox({ itemType, title, verdict, options = VERDICTS, className = "" }) {
  const { addFeedback } = useStore();
  const { push } = useToast();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [correction, setCorrection] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className={`flex items-center gap-2.5 bg-emerald-50 p-5 text-sm text-emerald-700 ${className}`}>
        <CheckCircle className="h-4 w-4 shrink-0" /> Thanks — your rating is now part of the AI's learning memory.
      </div>
    );
  }
  return (
    <div className={`space-y-3 p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Brain className="h-4 w-4 text-rose-600" /> Rate this verdict — it trains our AI
        </p>
        <div className="flex items-center" role="radiogroup" aria-label="Rate the accuracy of this verdict">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)} onClick={() => setRating(n)}
              className="p-0.5 transition-transform hover:scale-110">
              <Star className={`h-5 w-5 transition-colors ${(hovered || rating) >= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
            </button>
          ))}
        </div>
      </div>
      {rating > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={correction} onChange={(e) => setCorrection(e.target.value)}
            className="h-10 shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 text-sm text-slate-700 sm:w-[210px]">
            <option value="">{rating <= 2 ? "Correct verdict? (optional)" : "Suggest verdict (optional)"}</option>
            {options.filter((v) => v !== verdict).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Add a note (optional)" className={`${inputCls} h-10 flex-1`} />
          <Btn className="h-10 shrink-0" onClick={() => {
            addFeedback({ item_type: itemType, title, verdict, rating, correction, note: note.trim() });
            setDone(true);
            push("Thank you!", "Your feedback was added to the AI's learning memory.");
          }}>
            <Brain className="h-4 w-4" /> Teach the AI
          </Btn>
        </div>
      )}
    </div>
  );
}

/* Shared result card for the three checkers. */
function ResultCard({ result, meta }) {
  const hoax = result.is_known_hoax;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {meta && meta.embed}
      <div className={`space-y-3 border-b p-5 sm:p-6 ${hoax ? "border-red-100 bg-red-50" : "border-slate-200 bg-slate-50/60"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {meta && meta.lead}
            <div>
              <VerdictBadge verdict={result.verdict} size="lg" />
              {hoax && <p className="mt-1 text-xs font-medium text-red-600">This matches a known {result.hoax_type || "hoax"} pattern</p>}
              {meta && meta.vibe && <p className="mt-1 text-sm font-medium text-slate-500">{meta.vibe}</p>}
            </div>
          </div>
          {result.url && (
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="flex max-w-full items-center gap-1.5 truncate text-xs text-slate-500 hover:text-slate-900 sm:max-w-[300px]">
              <ExternalLink className="h-3 w-3 shrink-0" /> <span className="truncate">{result.url}</span>
            </a>
          )}
        </div>
        <h3 className="font-serif text-lg font-bold leading-snug text-slate-900 sm:text-xl">{result.title}</h3>
        <p className="text-sm text-slate-600">{result.summary}</p>
        <Meter score={result.credibility_score} />
      </div>
      <div className="space-y-2 p-5 sm:p-6">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Info className="h-4 w-4 text-slate-400" /> Detailed analysis</h4>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{result.analysis}</p>
      </div>
      {result.fact_check_sources && (
        <div className="space-y-1.5 border-t border-slate-200 bg-slate-50 p-5 sm:p-6">
          <h4 className="text-sm font-semibold text-slate-900">Fact-check sources</h4>
          <p className="text-sm text-slate-600">{result.fact_check_sources}</p>
        </div>
      )}
      <FeedbackBox className="border-t border-slate-200" itemType={result.kind} title={result.title} verdict={result.verdict}
        options={result.kind === "Forward" ? FWD_VERDICTS : result.kind === "Video" ? [...VERDICTS, ...YT_VERDICTS] : VERDICTS} />
      <div className="border-t border-blue-100 bg-blue-50 p-4">
        <div className="flex gap-2 text-xs text-blue-800">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><strong>Stay safe:</strong> cross-check important claims with official sources before sharing, and stay cautious of urgent messages or unusual links.</div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">Actively tested by real users · Please verify important claims independently</div>
    </div>
  );
}

function Steps({ step }) {
  const items = ["Paste", "AI analysis", "Verdict"];
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
      {items.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <div className="h-px w-8 bg-slate-300" />}
          <span className={`flex items-center gap-1.5 ${step === i ? "font-bold text-rose-600" : ""}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] ${step === i ? "border-rose-600 text-rose-600" : "border-slate-300"}`}>{i + 1}</span>
            {label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function PageHead({ icon: Icon, tint, title, text }) {
  return (
    <div className="space-y-3 text-center">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${tint}`}><Icon className="h-7 w-7" /></div>
      <h1 className="font-serif text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
      <p className="mx-auto max-w-xl text-sm text-slate-600 sm:text-base">{text}</p>
    </div>
  );
}

/* Reusable "pick a region + run" control. */
function ScanControl({ buttonLabel, tint, onRun, countLabel }) {
  const [region, setRegion] = useState("Global");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { prefs } = useStore();

  const run = async () => {
    setBusy(true);
    try {
      const found = await onRun({ region, count, interests: prefs.interests });
      push(found ? "Scan complete" : "No results", found ? `Added ${found} new items (${region}).` : "Nothing new found — try another region.");
    } catch (err) {
      push("Scan failed", aiMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-2">
      <Pop width="w-72" button={
        <Btn variant="outline" size="lg" className="gap-2 rounded-xl" disabled={busy}>
          <Settings className="h-4 w-4" /><span className="hidden sm:inline">{region}</span>
        </Btn>
      }>
        <div className="space-y-3">
          <Select label="Region" value={region} onChange={setRegion} options={opt(REGIONS)} />
          <Select label={countLabel || "Per platform"} value={String(count)} onChange={(v) => setCount(Number(v))}
            options={COUNTS.map((c) => ({ value: String(c), label: countLabel ? `${c}` : `${c} × 4 = ${c * 4} total` }))} />
          {prefs.interests.length > 0 && <p className="text-xs font-medium text-emerald-600">Prioritising: {prefs.interests.join(", ")}</p>}
        </div>
      </Pop>
      <Btn size="lg" className="gap-2 rounded-xl text-white shadow-md" style={{ backgroundColor: tint }} onClick={run} disabled={busy}>
        {busy ? <Search className="h-4 w-4 animate-pulse" /> : <Radar className="h-4 w-4" />}
        {busy ? "Scanning..." : buttonLabel}
      </Btn>
    </div>
  );
}

/* ============================================================ 9. VIEWS === */
function Feed({ go }) {
  const { articles, addArticles } = useStore();
  const [tab, setTab] = useState("All");
  const [filters, setFilters] = useState({ platform: "All", verdict: "All", region: "All", search: "" });

  const counts = useMemo(() => {
    const c = { total: articles.length, Fake: 0, Misleading: 0, Unverified: 0 };
    articles.forEach((a) => { if (c[a.verdict] !== undefined) c[a.verdict] += 1; });
    return c;
  }, [articles]);

  const list = useMemo(() => articles.filter((a) => {
    if (tab !== "All" && a.category !== tab) return false;
    if (filters.platform !== "All" && a.source_platform !== filters.platform) return false;
    if (filters.verdict !== "All" && a.verdict !== filters.verdict) return false;
    if (filters.region !== "All" && a.region !== filters.region) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (a.title || "").toLowerCase().includes(q) || (a.summary || "").toLowerCase().includes(q);
    }
    return true;
  }), [articles, tab, filters]);

  const dirty = tab !== "All" || filters.platform !== "All" || filters.verdict !== "All" || filters.region !== "All" || filters.search;
  const hero = list[0];
  const secondary = list.slice(1, 4);
  const grid = list.slice(4);

  const storyCard = (a, variant) => (
    <button key={a.id} onClick={() => go("article", a.id)} className="group block w-full text-left">
      {variant === "grid" ? (
        <article className="border-t-2 border-slate-900 pt-3">
          <div className="mb-1.5 flex items-center justify-between"><PlatformTag platform={a.source_platform} /><VerdictBadge verdict={a.verdict} /></div>
          <h3 className="mb-1 line-clamp-3 font-serif text-base font-bold leading-snug text-slate-900 group-hover:text-rose-700">{a.title}</h3>
          <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{a.summary}</p>
          <div className="flex items-center gap-2 text-[11px] text-slate-500"><Clock className="h-2.5 w-2.5" />{ago(a.created)}{a.category && <span>· {a.category}</span>}</div>
        </article>
      ) : (
        <article className="mb-4 border-b border-slate-200 pb-4 last:mb-0 last:border-0 last:pb-0">
          <div className="mb-1.5 flex items-center gap-2">
            {a.category && <span className="text-[10px] font-bold uppercase tracking-widest text-rose-700">{a.category}</span>}
            <span className="text-[10px] text-slate-400">·</span>
            <PlatformTag platform={a.source_platform} showLabel />
          </div>
          <h3 className="mb-1 line-clamp-2 font-serif text-lg font-bold leading-snug text-slate-900 group-hover:text-rose-700">{a.title}</h3>
          <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{a.summary}</p>
          <div className="flex items-center justify-between">
            <VerdictBadge verdict={a.verdict} />
            <span className="flex items-center gap-1 text-[11px] text-slate-500"><Clock className="h-2.5 w-2.5" />{ago(a.created)}</span>
          </div>
        </article>
      )}
    </button>
  );

  return (
    <div>
      <div className="border-b-2 border-slate-900 py-6 text-center">
        <h1 className="font-serif text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Altraz</h1>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
          <span>AI-powered misinformation tracker</span><span>·</span><span>{longDate()}</span>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2">
          {["All", ...CATEGORIES].map((cat) => (
            <button key={cat} onClick={() => setTab(cat)}
              className={`whitespace-nowrap px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${tab === cat ? "-mb-2 border-b-2 border-rose-600 pb-2 text-rose-600" : "text-slate-500 hover:text-slate-900"}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col items-stretch gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search articles..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-rose-400 focus:outline-none" />
          </div>
          <Select className="sm:w-[140px]" value={filters.platform} onChange={(v) => setFilters({ ...filters, platform: v })} options={opt(["All", ...PLATFORMS])} />
          <Select className="sm:w-[140px]" value={filters.verdict} onChange={(v) => setFilters({ ...filters, verdict: v })} options={opt(["All", ...VERDICTS])} />
          <Select className="sm:w-[150px]" value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })} options={opt(["All", ...REGIONS])} />
          {dirty && (
            <Btn variant="ghost" size="sm" className="shrink-0" onClick={() => { setTab("All"); setFilters({ platform: "All", verdict: "All", region: "All", search: "" }); }}>
              <X className="h-3 w-3" /> Clear
            </Btn>
          )}
          <div className="shrink-0">
            <ScanControl buttonLabel="Run Scan" tint="#dc2626" onRun={async ({ region, count, interests }) => {
              const found = await scanNews({ region, count, interests });
              if (found.length) addArticles(found);
              return found.length;
            }} />
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2.5 text-xs">
          {[["Flagged", counts.total, ""], ["Fake", counts.Fake, "text-red-600"], ["Misleading", counts.Misleading, "text-orange-600"], ["Unverified", counts.Unverified, "text-yellow-600"]].map(([label, value, tone], i) => (
            <React.Fragment key={label}>
              {i > 0 && <div className="h-5 w-px bg-slate-200" />}
              <div className="flex items-center gap-1.5">
                <span className={`font-serif text-lg font-bold ${tone}`}>{value}</span>
                <span className="font-medium uppercase tracking-wide text-slate-500">{label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <SourceTicker />

      {!articles.length ? (
        <div className="mx-auto max-w-7xl space-y-3 px-4 py-20 text-center">
          <Newspaper className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="font-serif text-xl font-bold text-slate-900">No articles yet</h3>
          <p className="mx-auto max-w-md text-sm text-slate-600">Run a scan to start detecting misinformation across social platforms.</p>
        </div>
      ) : !list.length ? (
        <div className="px-4 py-20 text-center text-slate-500">No articles match your filters.</div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
            <button onClick={() => go("article", hero.id)} className="group block text-left">
              <article className="sm:border-r sm:border-slate-200 sm:pr-6">
                <div className="mb-2 flex items-center gap-2">
                  <PlatformTag platform={hero.source_platform} showLabel />
                  {hero.category && <><span className="text-slate-400">·</span><span className="text-[10px] font-bold uppercase tracking-widest text-rose-700">{hero.category}</span></>}
                </div>
                <h2 className="mb-2 font-serif text-2xl font-bold leading-tight text-slate-900 group-hover:text-rose-700 sm:text-3xl">{hero.title}</h2>
                <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-slate-600">{hero.summary}</p>
                <div className="flex flex-wrap items-center gap-4"><VerdictBadge verdict={hero.verdict} /><Meter score={hero.credibility_score} /></div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ago(hero.created)}</span>
                  {hero.region && <span className="flex items-center gap-1"><Globe2 className="h-3 w-3" />{hero.region}</span>}
                </div>
              </article>
            </button>
            {secondary.length > 0 && <div>{secondary.map((a) => storyCard(a, "secondary"))}</div>}
          </div>
          {grid.length > 0 && (
            <div className="border-t-2 border-slate-900 pt-6">
              <h3 className="mb-4 font-serif text-lg font-bold uppercase tracking-wide text-slate-900">More stories</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{grid.map((a) => storyCard(a, "grid"))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArticlePage({ id, go }) {
  const { articles } = useStore();
  const a = articles.find((x) => x.id === id);
  if (!a) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-slate-500">This article is no longer here.</p>
        <Btn variant="outline" onClick={() => go("feed")}>Back to feed</Btn>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <button onClick={() => go("feed")} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to feed
      </button>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <PlatformTag platform={a.source_platform} showLabel />
          <VerdictBadge verdict={a.verdict} size="lg" />
          {a.category && <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600"><FileText className="h-3 w-3" />{a.category}</span>}
          {a.region && <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600"><Globe2 className="h-3 w-3" />{a.region}</span>}
        </div>
        <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{a.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Detected {ago(a.created)}</span>
          {a.engagement_count > 0 && <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />~{Number(a.engagement_count).toLocaleString()} engagements</span>}
        </div>
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Credibility assessment</h2>
        <Meter score={a.credibility_score} />
      </div>
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Claim summary</h2>
        <p className="leading-relaxed text-slate-700">{a.summary}</p>
      </div>
      {a.analysis && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">AI analysis</h2>
          <p className="whitespace-pre-line leading-relaxed text-slate-700">{a.analysis}</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[["Original source", a.original_source], ["Fact-check sources", a.fact_check_sources]].map(([label, value]) => value ? (
          <div key={label} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</h2>
            <p className="flex items-start gap-2 text-sm text-slate-700"><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{value}</p>
          </div>
        ) : null)}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <FeedbackBox itemType="Article" title={a.title} verdict={a.verdict} />
      </div>
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-800">
        <strong>A note from us:</strong> every verdict is actively tested by real people and improves with your feedback — still, always cross-check important claims with trusted sources.
      </div>
    </div>
  );
}

function Scams() {
  const { videos, addVideos } = useStore();
  const [filter, setFilter] = useState("All");
  const list = filter === "All" ? videos : videos.filter((v) => v.verdict === filter);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600"><Youtube className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold leading-tight text-slate-900">YouTube scam tracker</h1>
            <p className="text-sm text-slate-600">{videos.length} fraudulent and misleading videos detected</p>
          </div>
        </div>
        <ScanControl buttonLabel="Scan YouTube" tint="#b91c1c" countLabel="Videos"
          onRun={async ({ region, count }) => { const found = await scanYouTube({ region, count }); if (found.length) addVideos(found); return found.length; }} />
      </div>

      {videos.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {["All", ...YT_VERDICTS].map((v) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${filter === v ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{v}</button>
          ))}
        </div>
      )}

      {!videos.length ? (
        <div className="space-y-3 py-20 text-center">
          <Newspaper className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900">No videos scanned yet</h3>
          <p className="mx-auto max-w-md text-sm text-slate-600">Run a scan to detect scam, fraudulent and clickbait videos with thumbnails.</p>
        </div>
      ) : !list.length ? (
        <p className="py-12 text-center text-slate-500">No videos match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((v) => (
            <div key={v.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <a href={v.video_url || "#"} target="_blank" rel="noopener noreferrer" className="group/img relative block h-40 overflow-hidden bg-slate-900">
                {v.thumbnail_url
                  ? <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover/img:scale-105" onError={(e) => { e.target.style.display = "none"; }} />
                  : <div className="flex h-full w-full items-center justify-center"><Play className="h-10 w-10 text-white/30" /></div>}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover/img:opacity-100">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 shadow-lg"><Play className="ml-0.5 h-5 w-5 fill-white text-white" /></div>
                </div>
                <div className="absolute right-2 top-2"><VerdictBadge verdict={v.verdict} /></div>
              </a>
              <div className="flex flex-1 flex-col space-y-2 p-4">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{v.title}</h3>
                <p className="line-clamp-2 flex-1 text-xs text-slate-600">{v.summary}</p>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="max-w-[55%] truncate text-xs font-medium text-slate-600">{v.channel_name}</span>
                  <span className="text-xs text-slate-500">{ago(v.created)}</span>
                </div>
                {v.video_url && (
                  <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 pt-1 text-xs font-medium text-red-600 hover:text-red-700">
                    <ExternalLink className="h-3 w-3" /> Watch on YouTube
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VerifyLinkView() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const { push } = useToast();

  const run = async () => {
    if (!url.trim()) return push("Please enter a link", "Paste a URL first.");
    const clean = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    setBusy(true); setResult(null);
    try { setResult(await checkLink(clean)); }
    catch (err) { push("Verification unavailable", aiMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHead icon={ShieldCheck} tint="border-blue-200 bg-blue-50 text-blue-600" title="Verify any link"
        text="Paste a news article, social post or blog link. Our AI searches the web live and tells you if it's true, fake or misleading." />
      <Steps step={busy ? 1 : result ? 2 : 0} />
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800"><Search className="h-4 w-4 text-rose-600" /> Paste the link to verify</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Paste a news article or URL..." className={`${inputCls} h-12 text-base`} />
          <Btn size="lg" className="shrink-0 gap-2 rounded-xl px-8" style={{ backgroundColor: "#2563eb" }} onClick={run} disabled={busy}>
            {busy ? <Search className="h-4 w-4 animate-pulse" /> : <ShieldCheck className="h-4 w-4" />}{busy ? "Verifying..." : "Verify"}
          </Btn>
        </div>
        <p className="text-xs text-slate-500">Works with news articles, social posts and blogs — checked against live sources.</p>
      </div>
      {busy && <div className="rounded-2xl border border-slate-200 bg-white p-8"><Loader label="Analyzing..." /></div>}
      {result && !busy && <ResultCard result={result} meta={{ lead: <ShieldCheck className="h-6 w-6 shrink-0 text-blue-600" /> }} />}
    </div>
  );
}

function CheckForwardView() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const { push } = useToast();

  const run = async () => {
    if (text.trim().length < 10) return push("Paste a longer message", "We need at least a few words to analyze.");
    setBusy(true); setResult(null);
    try { setResult(await checkForward(text.trim())); }
    catch (err) { push("Analysis unavailable", aiMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHead icon={MessageCircle} tint="border-emerald-200 bg-emerald-50 text-emerald-600" title="WhatsApp forward checker"
        text="Received a suspicious forward? Paste it here and our AI checks it against fact-checkers and known hoaxes." />
      <SourceTicker />
      <Steps step={busy ? 1 : result ? 2 : 0} />
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800"><MessageCircle className="h-4 w-4 text-emerald-600" /> Paste the forwarded message</label>
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 5000))} placeholder="Paste the full text of the forward you received..."
          className="min-h-[160px] w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
        <div className="flex justify-between text-xs text-slate-500"><span>Your message is never stored.</span><span>{text.length} / 5000</span></div>
        <Btn size="lg" className="w-full gap-2 rounded-xl" style={{ backgroundColor: "#059669" }} onClick={run} disabled={busy || text.trim().length < 10}>
          {busy ? <Search className="h-4 w-4 animate-pulse" /> : <ShieldCheck className="h-4 w-4" />}{busy ? "Analyzing..." : "Analyze message"}
        </Btn>
      </div>
      {busy && <div className="rounded-2xl border border-slate-200 bg-white p-8"><Loader label="Analyzing..." /></div>}
      {result && !busy && <ResultCard result={result} meta={{ lead: result.is_known_hoax ? <AlertCircle className="h-6 w-6 shrink-0 text-red-600" /> : <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" /> }} />}
    </div>
  );
}

const VIDEO_TABS = [
  { id: "youtube", label: "YouTube", emoji: "📺", gradient: "from-red-500 to-red-600" },
  { id: "instagram", label: "Instagram", emoji: "📸", gradient: "from-purple-500 via-pink-500 to-orange-400" },
  { id: "facebook", label: "Facebook", emoji: "👍", gradient: "from-blue-500 to-blue-600" },
  { id: "x", label: "X / Twitter", emoji: "✖️", gradient: "from-slate-700 to-slate-900" },
  { id: "tiktok", label: "TikTok", emoji: "🎵", gradient: "from-slate-800 via-pink-500 to-cyan-400" },
  { id: "other", label: "Other", emoji: "🔗", gradient: "from-indigo-500 to-purple-500" },
];
const VIBES = {
  Fake: ["🚩", "This is sus!"], Scam: ["🚨", "Major red flag!"], Hoax: ["🎭", "Total hoax!"],
  Misleading: ["⚠️", "This is misleading"], Clickbait: ["🎣", "Total clickbait!"],
  Unverified: ["🤔", "Can't verify this yet"], "Partially True": ["🤷", "Half truth, half cap"],
  True: ["✅", "No cap, this checks out"], Legitimate: ["✅", "This is legit!"],
};

function CheckVideoView() {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const { push } = useToast();
  const platform = picked || (url ? detectPlatform(url) : "other");
  const tab = VIDEO_TABS.find((p) => p.id === platform) || VIDEO_TABS[5];

  const run = async () => {
    if (!url.trim()) return push("Drop a link first", "Paste a video link to check.");
    const clean = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    setBusy(true); setResult(null);
    try { setResult(await checkVideo(clean, platform)); }
    catch (err) { push("Analysis failed", aiMessage(err)); }
    finally { setBusy(false); }
  };

  const ytId = result && extractYouTubeId(result.url);
  const vibe = result ? (VIBES[result.verdict] || VIBES.Unverified) : null;
  const meta = result ? {
    lead: <span className="text-3xl">{vibe[0]}</span>,
    vibe: vibe[1],
    embed: ytId ? (
      <div className="aspect-video w-full overflow-hidden bg-black">
        <iframe src={`https://www.youtube.com/embed/${ytId}`} title={result.title} className="h-full w-full" allowFullScreen />
      </div>
    ) : null,
  } : {};

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <PageHead icon={Sparkles} tint="border-purple-200 bg-purple-50 text-purple-600" title="Video truth checker"
        text="Paste any video link — YouTube, Instagram, Facebook, X or TikTok. Our AI checks whether it's real, fake or just plain sus." />
      <div className="flex flex-wrap justify-center gap-2">
        {VIDEO_TABS.map((p) => (
          <button key={p.id} onClick={() => setPicked(p.id === picked ? null : p.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${platform === p.id ? `scale-105 bg-gradient-to-r ${p.gradient} text-white shadow-lg` : "border border-slate-200 bg-white text-slate-600 hover:scale-105"}`}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
      <div className="space-y-3 rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Drop any video link here..." className="h-14 w-full rounded-2xl border-2 border-slate-300 bg-white pl-12 pr-3 text-base focus:border-purple-400 focus:outline-none" />
          </div>
          <Btn size="lg" className="gap-2 rounded-2xl px-6 text-base font-bold sm:px-8" style={{ backgroundColor: "#7c3aed" }} onClick={run} disabled={busy}>
            {busy ? <Search className="h-5 w-5 animate-pulse" /> : <Sparkles className="h-5 w-5" />}{busy ? "Checking..." : "Check it"}
          </Btn>
        </div>
        <p className="text-center text-xs text-slate-500">
          {picked
            ? <>Checking as <strong>{tab.emoji} {tab.label}</strong> <button onClick={() => setPicked(null)} className="underline">auto-detect instead</button></>
            : `Auto-detected: ${tab.emoji} ${tab.label}`}
        </p>
      </div>
      {busy && <div className="rounded-3xl border-2 border-slate-200 bg-white p-10"><Loader label="Analyzing..." /></div>}
      {result && !busy && <ResultCard result={result} meta={meta} />}
    </div>
  );
}

function Profile() {
  const { prefs, savePrefs, feedback, resetAll } = useStore();
  const { push } = useToast();
  const initials = (prefs.name || "A").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const avg = feedback.length ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1) : "—";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-rose-600"><span className="text-xl font-bold text-white">{initials}</span></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-slate-900">{prefs.name || "Altraz user"}</h1>
            <p className="text-sm text-slate-500">Everything is stored in this browser — no account needed.</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Display name</span>
          <input value={prefs.name} onChange={(e) => savePrefs({ name: e.target.value })} className={inputCls} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><Star className="h-4 w-4 text-amber-500" /></div>
            <div><p className="text-xs text-slate-500">Ratings given</p><p className="font-medium text-slate-900">{feedback.length}</p></div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><Brain className="h-4 w-4 text-rose-600" /></div>
            <div><p className="text-xs text-slate-500">Average rating</p><p className="font-medium text-slate-900">{avg}</p></div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2"><Heart className="h-4 w-4 text-red-500" /><h2 className="font-semibold text-slate-900">Your interests</h2></div>
        <p className="text-xs text-slate-500">Scans prioritise these topics.</p>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((topic) => {
            const on = prefs.interests.includes(topic);
            return (
              <button key={topic} onClick={() => savePrefs({ interests: on ? prefs.interests.filter((i) => i !== topic) : [...prefs.interests, topic] })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {topic}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <Btn variant="outline" className="w-full gap-2 text-red-600 hover:bg-red-50"
          onClick={() => { resetAll(); savePrefs({ interests: [] }); push("Data reset", "Articles, videos and ratings were restored to the demo set."); }}>
          <RotateCcw className="h-4 w-4" /> Reset all saved data
        </Btn>
      </div>
    </div>
  );
}

const ABOUT_FEATURES = [
  ["bg-purple-600", Sparkles, "Video truth checker", "Paste any video link — YouTube, Instagram, Facebook, X or TikTok — and see what checks out."],
  ["bg-emerald-600", MessageCircle, "Forward checker", "Paste a suspicious forward and check it against known hoaxes and fact-checkers."],
  ["bg-blue-600", ShieldCheck, "Link verifier", "Paste any article or post link and get a straight answer, with the sources behind it."],
];
const ABOUT_VALUES = [
  [Target, "Accuracy first", "We'd rather say \"we're not sure\" than guess. Every verdict comes with its sources."],
  [Eye, "Transparency", "No black boxes. Here's the evidence behind every conclusion."],
  [Heart, "Your judgment, not ours", "We don't tell you what to think — we give you clear information so you can decide."],
  [Zap, "Always current", "Misinformation moves fast, so every check pulls live sources at the moment you ask."],
];

function About() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-12 sm:px-6">
      <div className="space-y-4 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Our story
        </span>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
          The internet is noisy. <span className="bg-gradient-to-r from-rose-600 to-emerald-600 bg-clip-text text-transparent">We help you hear the truth.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Altraz started with a simple frustration: it shouldn't take a media degree to know what's real online.
          Paste a link and get a straight answer in seconds.
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600"><Users className="h-5 w-5 text-white" /></div>
        <p className="text-sm leading-relaxed text-slate-700"><strong>Actively tested by real humans.</strong> Every tool is tried, broken, fixed and re-tested before it reaches you — and when you rate a verdict, it makes the next one better.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500"><ShieldAlert className="h-5 w-5 text-white" /></div>
          <h2 className="text-2xl font-bold text-slate-900">Why Altraz exists</h2>
        </div>
        <div className="space-y-3 leading-relaxed text-slate-600">
          <p>Every day, millions of people are misled by fake news, scam videos and viral hoaxes. It's getting harder to tell what's real, and most of us don't have time to cross-check every headline.</p>
          <p>Altraz was built to change that: paste a video, a link or a forwarded message and get a clear verdict, with sources, in seconds.</p>
          <p className="font-medium text-slate-800">We're not here to tell you what to think. We're here to give you the tools to think for yourself.</p>
        </div>
      </div>

      <div>
        <h2 className="mb-6 text-center text-2xl font-bold text-slate-900">What Altraz does</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {ABOUT_FEATURES.map(([bg, Icon, title, desc]) => (
            <div key={title} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg} text-white shadow-lg`}><Icon className="h-6 w-6" /></div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="mb-6 text-center text-2xl font-bold text-slate-900">What we stand for</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ABOUT_VALUES.map(([Icon, title, desc]) => (
            <div key={title} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50"><Icon className="h-5 w-5 text-emerald-600" /></div>
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="text-xs leading-relaxed text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-rose-600 to-emerald-600 p-8 text-center sm:p-12">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-white" />
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to spot the truth?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/85">Pick a tool above and check the next thing that lands in your feed.</p>
      </div>
    </div>
  );
}

const TERMS = [
  ["1. Acceptance of terms", "By using Altraz you agree to these terms. If you don't agree with any part of them, please don't use the app."],
  ["2. What Altraz does", "Altraz helps you check links, videos and forwarded messages for misinformation, scams and misleading claims. Each check gives a verdict, a credibility score and the sources behind both — a starting point for your own judgment, not the final word."],
  ["3. Accuracy & human oversight", "Every feature is actively tested by real people, and every verdict you rate helps improve the next one. No tool is perfect: treat the analysis as a well-researched second opinion."],
  ["4. Your responsibilities", "Use the app lawfully, don't misuse or disrupt it, don't use it to harass or spread misinformation, and use your own judgment when acting on any verdict."],
  ["5. Intellectual property", "The app, its design and branding belong to Altraz. Content you check remains the property of its owners — we claim no ownership over anything you submit."],
  ["6. Privacy", "Links and messages you submit are processed to produce a result. In this build everything else — your ratings and preferences — stays in your own browser."],
  ["7. Limitation of liability", "Altraz is not liable for damages or losses arising from use of the app or reliance on its analysis. The app is provided \"as is\" and \"as available\"."],
  ["8. Not professional advice", "Analysis is for information only — not legal, medical, financial or professional advice. For big decisions, talk to a qualified professional."],
  ["9. Changes", "The app may change or be updated at any time. Continuing to use it counts as accepting the updated terms."],
  ["10. Contact", "Questions about these terms? Reach the team through the app's support channel — a real human reads what you send."],
];

function Terms() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(0);
  const list = TERMS.filter(([t, b]) => (t + b).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-xs font-medium text-rose-700"><FileText className="h-3.5 w-3.5" /> Legal</span>
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Terms &amp; conditions</h1>
        <p className="text-sm text-slate-500">Last updated: 17 October 2026</p>
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-relaxed text-blue-800">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div><strong>The short version.</strong> Using Altraz means you agree to these terms. Our analysis assists your judgment — tested by real humans, never a replacement for your own thinking.</div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search terms & conditions..." className={`${inputCls} h-11 pl-10`} />
        {search && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{list.length} match{list.length === 1 ? "" : "es"}</span>}
      </div>
      <div className="space-y-3">
        {!list.length ? <p className="py-12 text-center text-slate-500">No sections match "{search}".</p> : list.map(([title, body], i) => (
          <div key={title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50">
              <h2 className="pr-4 text-base font-bold text-slate-900">{title}</h2>
              <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{body}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================ 10. SHELL === */
const NAV = [
  ["feed", "Feed", "#C8102E"], ["scams", "Scam Tracker", "#CC0000"], ["video", "Check Video", "#7C3AED"],
  ["forward", "Check Forward", "#059669"], ["link", "Verify Link", "#2563EB"],
  ["about", "About", "#D97706"], ["terms", "Terms", "#475569"], ["profile", "Profile", "#DB2777"],
];

function InterestsPopover() {
  const { prefs, savePrefs } = useStore();
  return (
    <Pop width="w-64" button={
      <Btn variant="outline" size="sm" className="shrink-0 gap-2 text-red-600">
        <Heart className={`h-3.5 w-3.5 ${prefs.interests.length ? "fill-red-500 text-red-500" : ""}`} />
        <span className="hidden md:inline">Interests{prefs.interests.length ? ` (${prefs.interests.length})` : ""}</span>
      </Btn>
    }>
      <p className="mb-1 text-sm font-medium text-slate-900">Your interests</p>
      <p className="mb-3 text-xs text-slate-500">Scans will prioritise these topics.</p>
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((topic) => {
          const on = prefs.interests.includes(topic);
          return (
            <button key={topic} onClick={() => savePrefs({ interests: on ? prefs.interests.filter((i) => i !== topic) : [...prefs.interests, topic] })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>{topic}</button>
          );
        })}
      </div>
    </Pop>
  );
}

function AutoScanControl() {
  const { prefs, addArticles } = useStore();
  const [settings, setSettings] = useState(() => ls.get("altraz_autoscan", { enabled: false, minutes: 10 }));
  const save = (next) => { setSettings(next); ls.set("altraz_autoscan", next); };

  useEffect(() => {
    if (!settings.enabled) return;
    const id = setInterval(async () => {
      try {
        const found = await scanNews({ region: "Global", count: 2, interests: prefs.interests });
        if (found.length) addArticles(found);
      } catch { /* background scans fail silently */ }
    }, settings.minutes * 60000);
    return () => clearInterval(id);
  }, [settings.enabled, settings.minutes, prefs.interests, addArticles]);

  return (
    <Pop width="w-64" button={
      <Btn variant="outline" size="sm" className="shrink-0 gap-2">
        <Zap className={`h-3.5 w-3.5 ${settings.enabled ? "text-emerald-500" : ""}`} />
        <span className="hidden md:inline">Auto-Scan</span>
        {settings.enabled && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
      </Btn>
    }>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><Zap className="h-4 w-4" /> Auto-scan</span>
          <Toggle checked={settings.enabled} onChange={(v) => save({ ...settings, enabled: v })} />
        </div>
        {settings.enabled && (
          <>
            <Select label="Scan interval" value={String(settings.minutes)} onChange={(v) => save({ ...settings, minutes: Number(v) })}
              options={[5, 10, 30, 60].map((m) => ({ value: String(m), label: m === 60 ? "Every hour" : `Every ${m} minutes` }))} />
            <p className="text-xs leading-relaxed text-slate-500">Scans run in the background while this page stays open.</p>
          </>
        )}
      </div>
    </Pop>
  );
}

export default function Altraz({ initial = "feed" }) {
  const [route, setRoute] = useState(initial);
  const [articleId, setArticleId] = useState(null);
  const [menu, setMenu] = useState(false);
  const [toasts, setToasts] = useState([]);

  const push = (title, description) => {
    const id = uid();
    setToasts((t) => [...t, { id, title, description }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  };

  const go = (next, id) => {
    setArticleId(id || null);
    setRoute(next);
    setMenu(false);
    window.scrollTo({ top: 0 });
  };

  const active = route === "article" ? "feed" : route;
  const navClass = (on) => `px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${on ? "text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`;

  return (
    <StoreProvider>
      <ToastCtx.Provider value={{ push }}>
        <style>{`
          @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
          @keyframes slide { 0%{margin-left:-35%} 50%{margin-left:100%} 100%{margin-left:-35%} }
        `}</style>

        <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900">
          <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
              <button onClick={() => go("feed")} className="flex shrink-0 items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500"><ShieldAlert className="h-5 w-5 text-white" /></span>
                <span className="hidden text-left sm:block">
                  <span className="block text-base font-bold leading-none">Altraz</span>
                  <span className="block text-[10px] leading-none text-slate-500">Misinformation Scanner</span>
                </span>
              </button>

              <nav className="hidden items-center gap-1 md:flex">
                {NAV.map(([key, label]) => (
                  <button key={key} onClick={() => go(key)} className={navClass(active === key)}>{label}</button>
                ))}
              </nav>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <InterestsPopover />
                <AutoScanControl />
                <button onClick={() => go("profile")} className="hidden h-9 w-9 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 md:flex" aria-label="Profile">
                  <Shield className="h-4 w-4 text-slate-500" />
                </button>
                <button onClick={() => setMenu((v) => !v)} className="rounded-lg p-2 hover:bg-slate-100 md:hidden" aria-label="Toggle menu">
                  {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {menu && (
              <nav className="space-y-1 border-t border-slate-200 bg-white px-3 py-3 md:hidden">
                {NAV.map(([key, label]) => (
                  <button key={key} onClick={() => go(key)}
                    className={`block w-full rounded-lg px-4 py-2.5 text-left text-sm font-medium ${active === key ? "bg-rose-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{label}</button>
                ))}
              </nav>
            )}
          </header>

          <main className="flex-1">
            {route === "feed" && <Feed go={go} />}
            {route === "article" && <ArticlePage id={articleId} go={go} />}
            {route === "scams" && <Scams />}
            {route === "video" && <CheckVideoView />}
            {route === "forward" && <CheckForwardView />}
            {route === "link" && <VerifyLinkView />}
            {route === "profile" && <Profile />}
            {route === "about" && <About />}
            {route === "terms" && <Terms />}
          </main>

          <BackToTop />

          <footer className="mt-auto border-t border-slate-200">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:px-6">
              <span>© 2026 Altraz · Actively tested by real users</span>
              <div className="flex items-center gap-4">
                <button onClick={() => go("about")} className="hover:text-slate-900">About</button>
                <button onClick={() => go("terms")} className="hover:text-slate-900">Terms &amp; conditions</button>
              </div>
            </div>
          </footer>
        </div>

        <div className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4">
          {toasts.map((t) => (
            <div key={t.id} className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-900 p-4 text-white shadow-lg">
              <div className="flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-white/80">{t.description}</p>}
              </div>
              <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} aria-label="Dismiss"><X className="h-4 w-4 text-white/60 hover:text-white" /></button>
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </StoreProvider>
  );
}