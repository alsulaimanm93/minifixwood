import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = process.env.API_UPSTREAM || "http://api:8000";

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const p = (ctx.params?.path || []).join("/");
  const url = `${UPSTREAM}/${p}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");

  // IMPORTANT: Set-Cookie needs special forwarding, otherwise cookies may not stick.
  respHeaders.delete("set-cookie");

  const resp = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });

  const anyHeaders: any = upstream.headers as any;
  const setCookies: string[] =
    (typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : null) ||
    (upstream.headers.get("set-cookie") ? [String(upstream.headers.get("set-cookie"))] : []);

  for (const sc of setCookies) {
    if (sc) resp.headers.append("set-cookie", sc);
  }

  return resp;
}

export async function GET(req: NextRequest, ctx: any) { return proxy(req, ctx); }
export async function POST(req: NextRequest, ctx: any) { return proxy(req, ctx); }
export async function PATCH(req: NextRequest, ctx: any) { return proxy(req, ctx); }
export async function PUT(req: NextRequest, ctx: any) { return proxy(req, ctx); }
export async function DELETE(req: NextRequest, ctx: any) { return proxy(req, ctx); }
export async function OPTIONS(req: NextRequest, ctx: any) { return proxy(req, ctx); }