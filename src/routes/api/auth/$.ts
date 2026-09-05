import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

const CLOSED: ResponseInit = {
  status: 403,
  headers: { "Content-Type": "application/json; charset=utf-8" },
};

function rejectPublicAuth(request: Request): Response | null {
  const path = new URL(request.url).pathname.toLowerCase();
  if (path.includes("sign-up") || path.includes("signup")) {
    return Response.json({ message: "账号由超级管理员开通，不能自行注册" }, CLOSED);
  }
  if (
    path.includes("oauth2") ||
    path.includes("grok-google") ||
    path.includes("grok-x") ||
    path.includes("grok-twitter") ||
    path.includes("/sign-in/social") ||
    path.includes("/signin/social")
  ) {
    return Response.json({ message: "不支持 Google / X 登录，请使用已开通的邮箱" }, CLOSED);
  }
  return null;
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => rejectPublicAuth(request) ?? auth.handler(request),
      POST: ({ request }) => rejectPublicAuth(request) ?? auth.handler(request),
    },
  },
});
