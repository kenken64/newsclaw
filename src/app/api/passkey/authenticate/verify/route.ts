import { NextResponse } from "next/server";
import { z } from "zod";

import { getPostAuthPath } from "@/lib/app-flow";
import {
  getPasskeyByCredentialId,
  getUserByEmail,
  setUserChallenge,
  updatePasskeyCounter,
} from "@/lib/db";
import { attachSessionCookie, createUserSession } from "@/lib/session";
import { getValidationErrorMessage } from "@/lib/validation";
import { verifyAuthentication } from "@/lib/webauthn";

const requestSchema = z.object({
  email: z.email(),
  response: z.object({
    id: z.string().min(1),
  }).passthrough(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const user = getUserByEmail(body.email);

    if (!user || !user.currentChallenge) {
      return NextResponse.json(
        { error: "Authentication session expired. Start again." },
        { status: 400 }
      );
    }

    const passkey = getPasskeyByCredentialId(body.response.id);

    if (!passkey || passkey.userId !== user.id) {
      return NextResponse.json(
        { error: "This passkey does not belong to the requested account." },
        { status: 404 }
      );
    }

    const verification = await verifyAuthentication({
      expectedChallenge: user.currentChallenge,
      passkey,
      response: body.response,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Passkey sign-in could not be verified." }, { status: 400 });
    }

    updatePasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter);
    setUserChallenge(user.id, null);

    const { session, expiresAt } = createUserSession(user.id);
  const nextPath = getPostAuthPath(user.id);
    const response = NextResponse.json({ nextPath });
    attachSessionCookie(response, session.id, expiresAt);

    return response;
  } catch (caughtError) {
    const message = getValidationErrorMessage(caughtError, "Unable to verify authentication.");

    return NextResponse.json({ error: message }, { status: 400 });
  }
}