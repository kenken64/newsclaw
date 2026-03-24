import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import {
  createSession,
  deleteSession,
  getSessionById,
  getUserById,
  pruneExpiredSessions,
  type UserRecord,
} from "@/lib/db";
import { SESSION_MAX_AGE_DAYS } from "@/lib/constants";

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "newsclaw_session";

function getExpirationDate() {
  return new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
}

export function attachSessionCookie(response: NextResponse, sessionId: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export function createUserSession(userId: string) {
  const expiresAt = getExpirationDate();
  const session = createSession({
    userId,
    expiresAt: expiresAt.toISOString(),
  });

  return { session, expiresAt };
}

export async function getCurrentUser() {
  pruneExpiredSessions();

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const session = getSessionById(sessionId);

  if (!session || new Date(session.expiresAt) <= new Date()) {
    deleteSession(sessionId);
    return null;
  }

  return getUserById(session.userId);
}

export function getCurrentUserFromRequest(request: Request) {
  pruneExpiredSessions();

  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionPair = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionPair) {
    return null;
  }

  const sessionId = decodeURIComponent(sessionPair.split("=").slice(1).join("="));
  const session = getSessionById(sessionId);

  if (!session || new Date(session.expiresAt) <= new Date()) {
    deleteSession(sessionId);
    return null;
  }

  return getUserById(session.userId);
}

export async function requireUser(): Promise<UserRecord> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return user;
}