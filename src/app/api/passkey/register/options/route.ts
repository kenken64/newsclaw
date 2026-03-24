import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createUser,
  getPasskeysByUserId,
  getUserByEmail,
  setUserChallenge,
} from "@/lib/db";
import { buildRegistrationOptions } from "@/lib/webauthn";

const requestSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2).max(80),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const existingUser = getUserByEmail(body.email);

    if (existingUser && getPasskeysByUserId(existingUser.id).length > 0) {
      return NextResponse.json(
        {
          error: "An account already exists for this email. Use sign in instead.",
        },
        { status: 409 }
      );
    }

    const user = existingUser ?? createUser({ email: body.email, name: body.name });
    const passkeys = getPasskeysByUserId(user.id);
    const options = await buildRegistrationOptions(user, passkeys);

    setUserChallenge(user.id, options.challenge);

    return NextResponse.json({ options });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to prepare registration.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}