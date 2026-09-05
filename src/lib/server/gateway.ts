import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { AssignableRole } from "@/lib/gateway/roles";

export const ensureAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const members = await import("@/lib/gateway/members");
  return members.ensureAccounts();
});

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => ({ email: String(input.email ?? "").trim() }))
  .handler(async ({ data }) => {
    const { requestPasswordReset: sendReset } = await import("@/lib/gateway/password-reset");
    return sendReset(data.email);
  });

export const completePasswordReset = createServerFn({ method: "POST" })
  .validator((input: { token: string; password: string }) => ({
    token: String(input.token ?? "").trim(),
    password: String(input.password ?? ""),
  }))
  .handler(async ({ data }) => {
    const { completePasswordReset: finish } = await import("@/lib/gateway/password-reset");
    return finish(data.token, data.password);
  });

export const loadMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const members = await import("@/lib/gateway/members");
    await members.ensureAccounts();
    const member = await members.getMember(context.userId);
    if (!member) throw new Error("账号未开通，请联系超级管理员");
    return member;
  });

export const loadMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const members = await import("@/lib/gateway/members");
    const me = await members.requireActive(context.userId);
    members.assertCan(me, "users.manage");
    return members.listMembers();
  });

export const createMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string; name: string; password: string; role: AssignableRole }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const me = await members.requireActive(context.userId);
    members.assertCan(me, "users.manage");
    return members.createMember({
      actorId: context.userId,
      email: data.email,
      name: data.name,
      password: data.password,
      role: data.role,
    });
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; name?: string; role?: AssignableRole; status?: "active" | "disabled" }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const me = await members.requireActive(context.userId);
    members.assertCan(me, "users.manage");
    return members.updateMember({
      actorId: context.userId,
      userId: data.userId,
      name: data.name,
      role: data.role,
      status: data.status,
    });
  });

export const setMemberPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; password: string }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const me = await members.requireActive(context.userId);
    members.assertCan(me, "users.manage");
    await members.setMemberPassword(data.userId, data.password);
    return { ok: true };
  });

export const loadResetRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const members = await import("@/lib/gateway/members");
    const reset = await import("@/lib/gateway/password-reset");
    const me = await members.requireActive(context.userId);
    members.assertCan(me, "users.manage");
    await Promise.race([
      reset.processInboundMail().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    return reset.listResetRequests();
  });

export const decideResetRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; action: "approve" | "reject" }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const reset = await import("@/lib/gateway/password-reset");
    const me = await members.requireActive(context.userId);
    members.assertCan(me, "users.manage");
    return reset.decideResetRequest({
      actorId: context.userId,
      requestId: data.id,
      action: data.action,
    });
  });

export const approveResetByMailToken = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => ({ token: String(input.token ?? "").trim() }))
  .handler(async ({ data }) => {
    const reset = await import("@/lib/gateway/password-reset");
    await Promise.race([
      reset.processInboundMail().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    return reset.approveByMailToken(data.token);
  });

export const loadWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const members = await import("@/lib/gateway/members");
    const store = await import("@/lib/gateway/store");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "keys.read");
    const seeded = await store.seedWorkspace(workspaceId);
    const [providers, models, keys, stats, logs] = await Promise.all([
      store.listProviders(workspaceId),
      store.listModels(workspaceId),
      store.listKeys(workspaceId),
      store.usageStats(workspaceId),
      store.listLogs(workspaceId, 40),
    ]);
    return {
      providers,
      models,
      keys,
      stats,
      logs,
      starterKey: member.role === "superadmin" ? seeded.starterKey : null,
      me: member,
    };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string }) => ({ name: input.name.trim() }))
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "keys.write");
    const { createKey } = await import("@/lib/gateway/store");
    return createKey(workspaceId, data.name);
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "keys.write");
    const { revokeKey } = await import("@/lib/gateway/store");
    await revokeKey(workspaceId, data.id);
    return { ok: true };
  });

export const saveProvider = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; name: string; baseUrl: string; apiKey?: string; enabled?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "providers.write");
    const { upsertProvider } = await import("@/lib/gateway/store");
    const id = await upsertProvider(workspaceId, data);
    return { id };
  });

export const removeProvider = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "providers.write");
    const { deleteProvider } = await import("@/lib/gateway/store");
    await deleteProvider(workspaceId, data.id);
    return { ok: true };
  });

export const saveModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; providerId: string; publicName: string; upstreamName: string }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "providers.write");
    const { upsertModel } = await import("@/lib/gateway/store");
    await upsertModel(workspaceId, data);
    return { ok: true };
  });

export const removeModel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "providers.write");
    const { deleteModel } = await import("@/lib/gateway/store");
    await deleteModel(workspaceId, data.id);
    return { ok: true };
  });

export const testProvider = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; baseUrl: string; apiKey?: string; model: string }) => input)
  .handler(async ({ context, data }) => {
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "providers.write");
    const { getProviderSecret } = await import("@/lib/gateway/store");
    const { joinUrl } = await import("@/lib/gateway/http");
    let baseUrl = data.baseUrl.trim();
    let apiKey = data.apiKey?.trim() ?? "";
    if (data.id) {
      const existing = await getProviderSecret(workspaceId, data.id);
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
    const members = await import("@/lib/gateway/members");
    const { member, workspaceId } = await members.actor(context.userId);
    members.assertCan(member, "playground");
    const { resolveRoute, logUsage } = await import("@/lib/gateway/store");
    const { joinUrl } = await import("@/lib/gateway/http");
    const route = await resolveRoute(workspaceId, data.model);
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
      userId: workspaceId,
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
