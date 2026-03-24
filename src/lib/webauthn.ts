import "server-only";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";

import { DEFAULT_PASSKEY_NAME } from "@/lib/constants";
import type { PasskeyRecord, UserRecord } from "@/lib/db";

const rpID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const origin = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";
const requireUserVerification =
  process.env.WEBAUTHN_REQUIRE_USER_VERIFICATION === "true";

function normalizeTransports(passkey: PasskeyRecord) {
  return passkey.transports as NonNullable<
    Parameters<typeof generateAuthenticationOptions>[0]["allowCredentials"]
  >[number]["transports"];
}

export function getWebAuthnConfiguration() {
  return {
    rpID,
    origin,
    rpName: "NewsClaw",
    requireUserVerification,
  };
}

export async function buildRegistrationOptions(user: UserRecord, passkeys: PasskeyRecord[]) {
  const { rpID, rpName, requireUserVerification } = getWebAuthnConfiguration();

  return generateRegistrationOptions({
    rpID,
    rpName,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    timeout: 60000,
    attestationType: "none",
    excludeCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: normalizeTransports(passkey),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: requireUserVerification ? "required" : "preferred",
    },
    supportedAlgorithmIDs: [-7, -257],
  });
}

export async function buildAuthenticationOptions(passkeys: PasskeyRecord[]) {
  const { rpID, requireUserVerification } = getWebAuthnConfiguration();

  return generateAuthenticationOptions({
    rpID,
    userVerification: requireUserVerification ? "required" : "preferred",
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: normalizeTransports(passkey),
    })),
    timeout: 60000,
  });
}

export async function verifyRegistration(input: {
  expectedChallenge: string;
  response: unknown;
}) {
  const { origin, rpID, requireUserVerification } = getWebAuthnConfiguration();

  return verifyRegistrationResponse({
    response: input.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification,
  }) as Promise<VerifiedRegistrationResponse>;
}

export async function verifyAuthentication(input: {
  expectedChallenge: string;
  passkey: PasskeyRecord;
  response: unknown;
}) {
  const { origin, rpID, requireUserVerification } = getWebAuthnConfiguration();

  return verifyAuthenticationResponse({
    response: input.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: input.passkey.credentialId,
      publicKey: Buffer.from(input.passkey.publicKey, "base64"),
      counter: input.passkey.counter,
      transports: normalizeTransports(input.passkey),
    },
    requireUserVerification,
  }) as Promise<VerifiedAuthenticationResponse>;
}

export function getPasskeyLabel(passkeyName?: string) {
  return passkeyName?.trim() || DEFAULT_PASSKEY_NAME;
}