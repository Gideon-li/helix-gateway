import { findKeyByHash, logUsage, resolveRoute, touchKey } from "./store";
import { sha256Hex } from "./crypto";
import { joinUrl, jsonResponse, openaiError, readBearer } from "./http";

type ChatBody = {
  model?: unknown;
  stream?: unknown;
  [key: string]: unknown;
};

export async function handleChatCompletions(request: Request, opts?: { userId?: string; apiKeyId?: string | null }): Promise<Response> {
  const started = Date.now();
  let userId = opts?.userId;
  let apiKeyId: string | null = opts?.apiKeyId ?? null;

  if (!userId) {
    const token = readBearer(request);
    if (!token) return openaiError(401, "Missing API key. Pass Authorization: Bearer sk-hx-…", "invalid_api_key");
    const found = await findKeyByHash(sha256Hex(token));
    if (!found || found.status !== "active") {
      return openaiError(401, "Invalid API key.", "invalid_api_key");
    }
    userId = found.userId;
    apiKeyId = found.id;
    await touchKey(found.id);
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return openaiError(400, "Request body must be JSON.", "invalid_request");
  }

  const requestedModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "qwen3.8-flash";
  const stream = body.stream === true;
  const route = await resolveRoute(userId, requestedModel);
  if (!route) {
    await logUsage({
      userId,
      apiKeyId,
      model: requestedModel,
      status: 404,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: Date.now() - started,
      error: "No upstream provider configured",
    });
    return openaiError(404, "No upstream provider configured. Add one in the Helix dashboard.", "model_not_found");
  }

  const payload = { ...body, model: route.upstreamName };
  const url = joinUrl(route.baseUrl, "/chat/completions");

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${route.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream fetch failed";
    await logUsage({
      userId,
      apiKeyId,
      model: route.publicName,
      status: 502,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: Date.now() - started,
      error: message,
    });
    return openaiError(502, `Upstream unreachable: ${message}`, "upstream_error", "api_error");
  }

  if (stream) {
    await logUsage({
      userId,
      apiKeyId,
      model: route.publicName,
      status: upstream.status,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: Date.now() - started,
      error: upstream.ok ? null : `upstream ${upstream.status}`,
    });
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const raw = await upstream.text();
  type UpstreamJson = {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  let parsed: UpstreamJson | null = null;
  try {
    parsed = JSON.parse(raw) as UpstreamJson;
  } catch {
    parsed = null;
  }

  await logUsage({
    userId,
    apiKeyId,
    model: route.publicName,
    status: upstream.status,
    promptTokens: parsed?.usage?.prompt_tokens ?? 0,
    completionTokens: parsed?.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - started,
    error: upstream.ok ? null : parsed?.error?.message ?? raw.slice(0, 300),
  });

  if (parsed) {
    parsed.model = route.publicName;
    return jsonResponse(parsed, upstream.status);
  }
  return new Response(raw, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handleModels(request: Request): Promise<Response> {
  const token = readBearer(request);
  if (!token) return openaiError(401, "Missing API key.", "invalid_api_key");
  const found = await findKeyByHash(sha256Hex(token));
  if (!found || found.status !== "active") return openaiError(401, "Invalid API key.", "invalid_api_key");
  await touchKey(found.id);

  const { listModels } = await import("./store");
  const models = (await listModels(found.userId)).filter((m) => m.enabled);
  const now = Math.floor(Date.now() / 1000);
  return jsonResponse({
    object: "list",
    data: models.map((m) => ({
      id: m.publicName,
      object: "model",
      created: now,
      owned_by: "helix",
    })),
  });
}
