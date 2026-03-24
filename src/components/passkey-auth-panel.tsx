"use client";

import { startTransition, useState } from "react";

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Radar,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Mode = "signup" | "signin";

type ApiResponse = {
  error?: string;
  message?: string;
  nextPath?: string;
  options?: unknown;
};

async function getJson<T>(response: Response) {
  return (await response.json()) as T;
}

export function PasskeyAuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateAccount() {
    if (!name.trim() || !email.trim()) {
      setError("Enter your full name and work email to create an OpenClaw workspace.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const optionsResponse = await fetch("/api/passkey/register/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email }),
      });
      const optionsPayload = await getJson<ApiResponse>(optionsResponse);

      if (!optionsResponse.ok || !optionsPayload.options) {
        throw new Error(optionsPayload.error ?? optionsPayload.message ?? "Unable to prepare workspace registration.");
      }

      const response = await startRegistration({
        optionsJSON: optionsPayload.options as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });

      const verifyResponse = await fetch("/api/passkey/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          passkeyName: `${name.trim().split(" ")[0] || "Primary"} device`,
          response,
        }),
      });
      const verifyPayload = await getJson<ApiResponse>(verifyResponse);

      if (!verifyResponse.ok) {
        throw new Error(verifyPayload.error ?? verifyPayload.message ?? "Verification failed. Please try again.");
      }

      startTransition(() => {
        router.push(verifyPayload.nextPath ?? "/setup-agent");
        router.refresh();
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to create the account.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    if (!email.trim()) {
      setError("Enter the email attached to your OpenClaw workspace.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const optionsResponse = await fetch("/api/passkey/authenticate/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const optionsPayload = await getJson<ApiResponse>(optionsResponse);

      if (!optionsResponse.ok || !optionsPayload.options) {
        throw new Error(optionsPayload.error ?? optionsPayload.message ?? "Unable to prepare sign-in.");
      }

      const response = await startAuthentication({
        optionsJSON: optionsPayload.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });

      const verifyResponse = await fetch("/api/passkey/authenticate/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, response }),
      });
      const verifyPayload = await getJson<ApiResponse>(verifyResponse);

      if (!verifyResponse.ok) {
        throw new Error(verifyPayload.error ?? verifyPayload.message ?? "Unable to continue into the workspace.");
      }

      startTransition(() => {
        router.push(verifyPayload.nextPath ?? "/dashboard");
        router.refresh();
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to sign in right now.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-[430px] border-white/70 bg-white/92 shadow-[0_30px_100px_-40px_rgba(12,34,64,0.45)] backdrop-blur-xl">
      <CardHeader className="gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Badge className="rounded-full bg-[color:var(--brand-ink)]/10 px-3 py-1 text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-ink)]/10">
            Launch in minutes
          </Badge>
          <div className="rounded-full border border-[color:var(--brand-ink)]/10 bg-[color:var(--brand-ink)]/5 p-2 text-[color:var(--brand-ink)]">
            <Radar className="size-4" />
          </div>
        </div>
        <div className="space-y-1">
          <CardTitle className="text-xl sm:text-2xl">Set up your OpenClaw briefing desk</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-600">
            Start with a workspace identity, move through agent setup, and land on a dashboard tuned to your coverage priorities.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
        <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.95))] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-950">Workspace launch path</p>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">3 steps</span>
          </div>
          <div className="space-y-2">
            {[
              ["Step 1", "Create desk", "Register the workspace identity used for your news operations."],
              ["Step 2", "Configure agent", "Set preferred topics and region focus for the desk."],
              ["Step 3", "Open dashboard", "Select categories and shape the front page for your team."],
            ].map(([step, title, copy]) => (
              <div key={step} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                  {step.split(" ")[1]}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{step}</p>
                  <p className="mt-1 text-sm font-medium text-slate-950">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === "signup"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            New desk
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === "signin"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Resume desk
          </button>
        </div>

        <div className="rounded-[22px] bg-[color:var(--brand-ink)] px-4 py-4 text-white sm:px-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/10 p-2 text-[color:var(--brand-highlight)]">
              {mode === "signup" ? <Sparkles className="size-4" /> : <Waypoints className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {mode === "signup" ? "Create a new editorial workspace" : "Continue an existing workspace"}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                {mode === "signup"
                  ? "You will register the desk, configure the OpenClaw agent, and then move directly into category setup."
                  : "Use the same workspace email to reopen your dashboard and continue monitoring."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {mode === "signup" ? (
            <div className="grid gap-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ava Patel"
                autoComplete="name"
                disabled={busy}
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="username webauthn"
              disabled={busy}
            />
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <Button
          className="h-11 w-full rounded-2xl bg-[color:var(--brand-ink)] text-white hover:bg-[color:var(--brand-ink-strong)]"
          size="lg"
          onClick={mode === "signup" ? handleCreateAccount : handleSignIn}
          disabled={busy}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : mode === "signup" ? <Sparkles /> : <Waypoints />}
          {mode === "signup" ? "Create OpenClaw workspace" : "Continue to workspace"}
        </Button>

        <Separator className="hidden sm:block" />

        <div className="hidden gap-3 text-sm text-slate-600 sm:grid">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--brand-ink)]" />
            <div>
              <p className="font-medium text-slate-900">Mission-driven setup</p>
              <p className="mt-1 leading-6">Capture preferred topics and coverage settings before the dashboard goes live.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--brand-ink)]" />
            <div>
              <p className="font-medium text-slate-900">Category-led front page</p>
              <p className="mt-1 leading-6">Organize coverage into a dashboard built around the lanes your team actually tracks.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--brand-ink)]" />
            <div>
              <p className="font-medium text-slate-900">Built for active desks</p>
              <p className="mt-1 leading-6">Designed for research, editorial, comms, and market-monitoring workflows.</p>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-4 border-none bg-transparent px-5 pb-5 pt-0 text-xs text-slate-500 sm:px-6 sm:pb-6">
        <span>OpenClaw briefing desk</span>
        <span>Workspace stored locally</span>
      </CardFooter>
    </Card>
  );
}