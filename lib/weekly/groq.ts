/**
 * Groq (OpenAI-compatible) client — the single AI provider for the weekly
 * module (data import extraction, Section A narrative drafting, inline text
 * actions, and screenshot vision summaries). Server-side only; the key stays
 * in GROQ_API_KEY. Without a key `isGroqConfigured()` is false and callers
 * return a friendly "not configured" message.
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

function buildBody(opts: GroqChatOpts, stream: boolean): { model: string; body: Record<string, unknown> } {
  const useVision = !!opts.image;
  const model = useVision ? groqVisionModel() : groqModel();
  const userContent: unknown = opts.image
    ? [
        { type: "text", text: opts.user },
        { type: "image_url", image_url: { url: `data:${opts.image.mediaType};base64,${opts.image.data}` } },
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
    stream,
  };
  if (opts.jsonMode && !useVision) body.response_format = { type: "json_object" };
  return { model, body };
}

function authHeaders(): Record<string, string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set on the server.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

/** One (non-streaming) Groq chat completion. Returns the assistant message text. */
export async function groqChat(opts: GroqChatOpts): Promise<string> {
  const { model, body } = buildBody(opts, false);
  let res: Response;
  try {
    res = await fetch(`${groqApiBase()}/chat/completions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Could not reach Groq: ${err instanceof Error ? err.message : "network error"}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status} (model ${model}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Groq returned an empty response.");
  }
  return content;
}

/**
 * Streaming Groq chat completion. Calls `onText` with each text delta.
 * Parses the OpenAI-compatible SSE stream (`data: {json}` lines).
 */
export async function groqChatStream(opts: GroqChatOpts, onText: (t: string) => void): Promise<void> {
  const { model, body } = buildBody(opts, true);
  let res: Response;
  try {
    res = await fetch(`${groqApiBase()}/chat/completions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Could not reach Groq: ${err instanceof Error ? err.message : "network error"}`);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status} (model ${model}): ${text.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) onText(delta);
      } catch {
        /* ignore keep-alive / partial lines */
      }
    }
  }
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
