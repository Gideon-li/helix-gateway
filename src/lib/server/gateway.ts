import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } from "@/lib/gateway/constants";

export const bootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { auth } = await import("@/lib/auth/server");
  try {
    await auth.api.signUpEmail({
      body: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: ADMIN_NAME,
      },
    });
    return { created: true };
  } catch {
    return { created: false };
  }
});

export const loadWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const store = await import("@/lib/gateway/store");
    const seeded = await store.seedWorkspace(context.userId);
    const [providers, models, keys, stats, logs] = await Promise.all([
      store.listProviders(context.userId),
      store.listModels(context.userId),
      store.listKeys(context.userId),
      store.usageStats(context.userId),
      store.listLogs(context.userId, 40),
    ]);
    return { providers, models, keys, stats, logs, starterKey: seeded.starterKey };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string }) => ({ name: input.name.trim() }))
  .handler(async ({ context, data }) => {
    const { createKey } = await import("@/lib/gateway/store");
    return createKey(context.userId, data.name);
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ context, data }) => {
    const { revokeKey } = await import("@/lib/gateway/store");
    await revokeKey(context.userId, data.id);
    return { ok: true };
  });

export const saveProvider = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; name: string; baseUrl: string; apiKey?: string; enabled?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const { upsertProvider } = await import("@/lib/gateway/store");
    const id = await upsertProvider(context.userId, data);
    return { id };
  });

export const removeProvider = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const { deleteProvider } = await import("@/lib/gateway/store");
    await deleteProvider(context.userId, data.id);
    return { ok: true };
  });

export const saveModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; providerId: string; publicName: string; upstreamName: string }) => input)
  .handler(async ({ context, data }) => {
    const { upsertModel } = await import("@/lib/gateway/store");
    await upsertModel(context.userId, data);
    return { ok: true };
  });

export const removeModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const { deleteModel } = await import("@/lib/gateway/store");
    await deleteModel(context.userId, data.id);
    return { ok: true };
  });

export const testProvider = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; baseUrl: string; apiKey?: string; model: string }) => input)
  .handler(async ({ context, data }) => {
    const { getProviderSecret } = await import("@/lib/gateway/store");
    const { joinUrl } = await import("@/lib/gateway/http");
    let baseUrl = data.baseUrl.trim();
    let apiKey = data.apiKey?.trim() ?? "";
    if (data.id) {
      const existing = await getProviderSecret(context.userId, data.id);
      if (!existing) throw new Error("上游不存在");
      baseUrl = data.baseUrl.trim() || existing.baseUrl;
      if (!apiKey) apiKey = existing.apiKey;
    }
    if (!apiKey) throw new Error("缺少上游 API Key");
    const url = joinUrl(baseUrl, "/chat/completions");
    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: data.model.trim() || "qwen3.8-flash",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
    });
    const text = await res.text();
    let snippet = text.slice(0, 280);
    try {
      const json = JSON.parse(text) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      snippet = json.choices?.[0]?.message?.content ?? json.error?.message ?? snippet;
    } catch {
      /* keep snippet */
    }
    return { ok: res.ok, status: res.status, snippet, latencyMs: Date.now() - started };
  });

export const runPlayground = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { model: string; messages: { role: string; content: string }[]; temperature?: number }) => input)
  .handler(async ({ context, data }) => {
    const { resolveRoute, logUsage } = await import("@/lib/gateway/store");
    const { joinUrl } = await import("@/lib/gateway/http");
    const route = await resolveRoute(context.userId, data.model);
    if (!route) throw new Error("还没有配置上游。请先在「上游」页添加提供商。");
    const url = joinUrl(route.baseUrl, "/chat/completions");
    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${route.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: route.upstreamName,
        messages: data.messages,
        temperature: data.temperature ?? 0.7,
        enable_thinking: false,
        max_tokens: 512,
      }),
    });
    const json = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    if (!res.ok) {
      throw new Error(json.error?.message ?? `上游返回 ${res.status}`);
    }
    await logUsage({
      userId: context.userId,
      apiKeyId: null,
      model: route.publicName,
      status: res.status,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
    });
    return {
      content: json.choices?.[0]?.message?.content ?? "",
      reasoning: json.choices?.[0]?.message?.reasoning_content ?? "",
      usage: json.usage ?? null,
      latencyMs: Date.now() - started,
      model: route.publicName,
    };
  });
