import type { Bindings } from "./bindings";

export function assertProductionConfig(environment: NodeJS.ProcessEnv = process.env): void {
  if (configuredEnvironment(environment) !== "production") return;

  const required = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "SESSION_COOKIE_SECRET"];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) throw new Error(`production configuration is missing: ${missing.join(", ")}`);
  if (environment.AUTH_DELIVERY_MODE !== "resend" || environment.AUTH_TEST_CODE?.trim()) {
    throw new Error("production requires AUTH_DELIVERY_MODE=resend and no AUTH_TEST_CODE");
  }

  const origins = ["APP_ORIGIN", "PUBLIC_QR_ORIGIN", "AUTH_OAUTH_CALLBACK_ORIGIN"] as const;
  for (const name of origins) {
    if (!environment[name]?.trim().startsWith("https://")) throw new Error(`production ${name} must use HTTPS`);
  }
  if ((environment.SESSION_COOKIE_SECRET ?? "").trim().length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must contain at least 32 characters");
  }
}

export function configuredEnvironment(environment: NodeJS.ProcessEnv): Bindings["ENVIRONMENT"] {
  return (environment.ENVIRONMENT?.trim() || "development") as Bindings["ENVIRONMENT"];
}
