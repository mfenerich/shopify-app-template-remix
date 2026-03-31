import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Proxies number-pool calls to the `numbers` Cloud Function.
 *
 * Checkout UI extensions must not call the storefront `/apps/numbers/*` URL when the Online Store
 * is password-protected — Shopify returns 302 to `/password` before App Proxy runs. This route
 * authenticates via `authenticate.public.checkout` (session token) and forwards server-side
 * with the API key.
 */
const UPSTREAM =
  process.env.NUMBERS_FUNCTION_URL ||
  "https://europe-west6-shopify-458710.cloudfunctions.net/numbers";

const API_KEY = process.env.NUMBERS_API_KEY || "";

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (params.segment !== "available") {
    throw new Response("Not Found", { status: 404 });
  }
  const { cors } = await authenticate.public.checkout(request);
  const src = new URL(request.url);
  const upstream = new URL(`${UPSTREAM.replace(/\/$/, "")}/available`);
  upstream.search = src.search;

  const res = await fetch(upstream.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    },
  });
  const text = await res.text();
  return cors(
    new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    }),
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const seg = params.segment;
  if (seg !== "lock" && seg !== "unlock") {
    throw new Response("Not Found", { status: 404 });
  }
  const { cors } = await authenticate.public.checkout(request);
  const body = await request.text();
  const res = await fetch(`${UPSTREAM.replace(/\/$/, "")}/${seg}`, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      Accept: "application/json",
      ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    },
    body,
  });
  const text = await res.text();
  return cors(
    new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    }),
  );
}
