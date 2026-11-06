/**
 * LLM spam/fraud screening via OpenAI GPT-4o-mini (server-only).
 * Layers on top of the heuristic brain. Returns null when no key is configured
 * or the call fails, so publishing always falls back to heuristics safely.
 */

import { VERTICAL } from "@/vertical";

export interface AiSpamResult { risk: number; block: boolean; reasons: string[] }

export interface AiInput {
  title: string;
  description?: string;
  price?: number | null;
  currency?: string;
  category?: string;
  condition?: string | null;
  specs?: Record<string, any>;
}

function configured(): string | null {
  const k = process.env.OPENAI_API_KEY;
  if (!k || k.length < 20 || k.startsWith("your-") || k.includes("...")) return null;
  return k;
}

const SYSTEM = `You are the strict, creative fraud-and-spam moderator for ${VERTICAL.moderation.sells}. You review a NEW listing and decide how risky it is (0-100) and whether to BLOCK it from going live.

Flag AGGRESSIVELY and creatively:
- Scams: advance/token payment, "prize/lottery won", investment/crypto/forex, too-good-to-be-true deals, "money back", delivery/shipping-fee scams.
- Off-platform contact of ANY kind hidden in the text: phone numbers, WhatsApp/Telegram/Instagram handles, emails, links — INCLUDING obfuscated ones like "0-3-1-1-2-1-4-3", "O three one one", spaced digits, "dm me", "contact on insta @…". Buyers must use the in-app contact, so ANY such attempt is a block.
${VERTICAL.moderation.scamHints.map((h) => `- ${h}.`).join("\n")}
- Impossibly low prices for the item, bait pricing.
- Adult/illegal/weapon content, hate.
- Gibberish, empty, or copy-paste low-effort listings.

Legitimate, normal ads (real make/model, sensible price, honest condition, no contact info in text) must PASS with low risk (< 40) and block=false.

Respond ONLY with compact JSON: {"risk": <0-100 integer>, "block": <boolean>, "reasons": [<short English strings>]}.`;

export async function aiScreenListing(input: AiInput): Promise<AiSpamResult | null> {
  const key = configured();
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_SPAM_MODEL || "gpt-4o-mini",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: "Listing to review:\n" + JSON.stringify(input).slice(0, 4000) },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) { console.warn("[spam-ai] OpenAI HTTP", res.status); return null; }
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const risk = Math.max(0, Math.min(100, Math.round(Number(parsed.risk) || 0)));
    return {
      risk,
      block: Boolean(parsed.block) || risk >= 70,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6).map(String) : [],
    };
  } catch (e: any) {
    console.warn("[spam-ai] screen failed:", e?.message);
    return null;
  }
}
