import { NextResponse } from "next/server";
import { z } from "zod";

import { getPostAuthPath } from "@/lib/app-flow";
import {
  createPasskey,
  getPasskeyByCredentialId,
  getUserByEmail,
  setUserChallenge,
} from "@/lib/db";
import { attachSessionCookie, createUserSession } from "@/lib/session";
import { getPasskeyLabel, verifyRegistration } from "@/lib/webauthn";

const requestSchema = z.object({
  email: z.email(),
  passkeyName: z.string().trim().min(1).max(60).optional(),
  response: z.unknown(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const user = getUserByEmail(body.email);

    if (!user || !user.currentChallenge) {
      return NextResponse.json(
        { error: "Registration session expired. Start again." },
        { status: 400 }
      );
    }

    const verification = await verifyRegistration({
      expectedChallenge: user.currentChallenge,
      response: body.response,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Passkey registration was not verified." }, { status: 400 });
    }

    const credential = verification.registrationInfo.credential;

    if (getPasskeyByCredentialId(credential.id)) {
      return NextResponse.json(
        { error: "This passkey has already been registered." },
        { status: 409 }
      );
    }

    createPasskey({
      userId: user.id,
      name: getPasskeyLabel(body.passkeyName),
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
      transports: credential.transports ?? [],
    });

    setUserChallenge(user.id, null);

    const { session, expiresAt } = createUserSession(user.id);
  const nextPath = getPostAuthPath(user.id);
    const response = NextResponse.json({ nextPath });
    attachSessionCookie(response, session.id, expiresAt);

    return response;
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to verify registration.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}