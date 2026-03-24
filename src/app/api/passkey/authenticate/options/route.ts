import { NextResponse } from "next/server";
import { z } from "zod";

import { getPasskeysByUserId, getUserByEmail, setUserChallenge } from "@/lib/db";
import { buildAuthenticationOptions } from "@/lib/webauthn";

const requestSchema = z.object({
  email: z.email(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const user = getUserByEmail(body.email);

    if (!user) {
      return NextResponse.json(
        { error: "No account exists for this email yet." },
        { status: 404 }
      );
    }

    const passkeys = getPasskeysByUserId(user.id);

    if (passkeys.length === 0) {
      return NextResponse.json(
        { error: "No passkey is registered for this account yet." },
        { status: 404 }
      );
    }

    const options = await buildAuthenticationOptions(passkeys);
    setUserChallenge(user.id, options.challenge);

    return NextResponse.json({ options });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to prepare authentication.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}