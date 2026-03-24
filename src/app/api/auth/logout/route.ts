import { NextResponse } from "next/server";

import { deleteSession } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
} from "@/lib/session";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionPair = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (sessionPair) {
    const sessionId = decodeURIComponent(sessionPair.split("=").slice(1).join("="));
    deleteSession(sessionId);
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);

  return response;
}