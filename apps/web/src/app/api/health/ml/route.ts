/**
 * ML wiring diagnostic. Hit this in any environment to see — from the SERVER runtime — whether the
 * web app can actually reach the measurement service:
 *
 *   GET /api/health/ml  →  {
 *     mlServiceUrlPresent, mlServiceUrlHost,   // is ML_SERVICE_URL set in THIS runtime? (host only — public)
 *     mlServiceTokenPresent,                   // is ML_SERVICE_TOKEN set? (boolean — never the value)
 *     nodeEnv,
 *     reachable, mlHealthStatus, mlHealthBody  // did GET {url}/health return 200?
 *   }
 *
 * This is the fast way to diagnose "behavioral returns mocked:true": if mlServiceUrlPresent is
 * false in Production, the env var isn't set for the Vercel PRODUCTION environment (set it, then
 * redeploy). If it's present + reachable:true, the forward mechanism is healthy. Exposes no secrets
 * (the token is reported only as a boolean; the URL host is a public Render address).
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always read the live env + probe; never cache/inline

export async function GET() {
  const url = (process.env.ML_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
  const tokenPresent = !!(process.env.ML_SERVICE_TOKEN ?? "").trim();

  let host: string | null = null;
  try {
    host = url ? new URL(url).host : null;
  } catch {
    host = "(invalid ML_SERVICE_URL)";
  }

  const out: Record<string, unknown> = {
    mlServiceUrlPresent: !!url,
    mlServiceUrlHost: host,
    mlServiceTokenPresent: tokenPresent,
    nodeEnv: process.env.NODE_ENV ?? null,
  };

  if (url) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
      out.reachable = res.ok;
      out.mlHealthStatus = res.status;
      out.mlHealthBody = await res.json().catch(() => null);
    } catch (e) {
      out.reachable = false;
      out.error = (e as Error).message;
    }
  } else {
    out.reachable = false;
    out.hint = "ML_SERVICE_URL is not set in this runtime — set it for the Vercel Production environment and redeploy.";
  }

  return NextResponse.json(out);
}
