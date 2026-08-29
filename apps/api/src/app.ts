import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import type { Bindings } from "@api/bindings";
import { assetRoutes } from "@api/routes/asset-routes";
import { authRoutes } from "@api/routes/auth-routes";
import { projectRoutes } from "@api/routes/project-routes";
import { publicRoutes } from "@api/routes/public-routes";
import { codeRoutes, publicCodeRoutes } from "@api/routes/code-routes";

export const app = new Hono<{ Bindings: Bindings }>();

const apiCors = createMiddleware<{ Bindings: Bindings }>(async (context, next) => {
  const requestOrigin = context.req.header("Origin");
  const allowedOrigin = requestOrigin === context.env.APP_ORIGIN ? requestOrigin : undefined;

  if (context.req.method === "OPTIONS") {
    if (allowedOrigin) {
      context.header("Access-Control-Allow-Origin", allowedOrigin);
      context.header("Access-Control-Allow-Credentials", "true");
    }
    context.header("Access-Control-Allow-Headers", "Content-Type, X-Revision, X-Idempotency-Key, X-Event-Id");
    context.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    context.header("Access-Control-Max-Age", "86400");
    context.header("Vary", "Origin");
    return context.body(null, 204);
  }

  await next();

  if (allowedOrigin) {
    context.header("Access-Control-Allow-Origin", allowedOrigin);
    context.header("Access-Control-Allow-Credentials", "true");
    context.header("Vary", "Origin");
  }
});

app.use("*", secureHeaders());
app.use("/api/*", apiCors);

app.route("/api/auth", authRoutes);
app.route("/api", codeRoutes);
app.route("/api/public", publicCodeRoutes);
app.route("/api", projectRoutes);
app.route("/api", assetRoutes);
app.route("/api/public", publicRoutes);

app.get("/api/health", (context) =>
  context.json({
    data: {
      status: "ok",
      environment: context.env.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    },
  }),
);

app.notFound((context) => {
  if (context.req.path.startsWith("/s/")) {
    return new Response("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\"><title>TPQRCODE</title></head><body><div id=\"root\"></div></body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }
  return context.json({ error: { code: "NOT_FOUND", message: "请求的资源不存在" } }, 404);
});

app.onError((error, context) => {
  console.error(error);
  return context.json({ error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" } }, 500);
});
