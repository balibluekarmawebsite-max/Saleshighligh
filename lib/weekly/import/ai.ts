/**
 * Groq (OpenAI-compatible) client for the AI-assisted Data Import.
 *
 * Used server-side only. Reads the data that was uploaded for one section —
 * a CSV / Excel dump as text, pasted notes, or a screenshot — and asks the
 * model to arrange it into that section's report rows. The key stays on the
 * server; without it `isGroqConfigured()` is false and the routes return a
 * friendly "not configured" message.
 */

export function groqApiBase(): string {
  return (process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
}

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export function groqModel(): string {
  return process.env.GROQ_MODEL || "openai/gpt-oss-120b";
}

export function groqVisionModel(): string {
  return process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
}

export interface GroqImage {
  /** base64 (no data: prefix) */
  data: string;
  /** e.g. image/png, image/jpeg */
  mediaType: string;
}

export interface GroqChatOpts {
  system: string;
  user: string;
  image?: GroqImage | null;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/** One Groq chat completion. Returns the assistant message text. */
export async function groqChat(opts: GroqChatOpts): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set on the server.");

  const useVision = !!opts.image;
  const model = useVision ? groqVisionModel() : groqModel();

  const userContent: unknown = opts.image
    ? [
        { type: "text", text: opts.user },
        {
          type: "image_url",
          image_url: { url: `data:${opts.image.mediaType};base64,${opts.image.data}` },
        },
      ]
    : opts.user;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: userContent },
    ],
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 4000,
  };
  // JSON mode is reliable on the text models; skip it for vision requests.
  if (opts.jsonMode && !useVision) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${groqApiBase()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const m = err instanceof Error ? err.message : "network error";
    throw new Error(`Could not reach Groq: ${m}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Surface the model name on the common "model not found" case.
    throw new Error(`Groq API ${res.status} (model ${model}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Groq returned an empty response.");
  }
  return content;
}

/** Coerce an array of model-produced objects into string rows for the given keys. */
export function coerceRows(arr: unknown, keys: string[]): Record<string, string>[] {
  if (!Array.isArray(arr)) return [];
  const out: Record<string, string>[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const row: Record<string, string> = {};
    let any = false;
    for (const k of keys) {
      const v = rec[k];
      if (v === null || v === undefined) {
        row[k] = "";
        continue;
      }
      const s = typeof v === "number" ? String(v) : String(v).trim();
      row[k] = s;
      if (s !== "" && s.toLowerCase() !== "null") any = true;
    }
    if (any) out.push(row);
  }
  return out;
}

/** Parse a model's text output as JSON, tolerating code fences / prose around it. */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to brace extraction */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("The AI response was not valid JSON.");
}
