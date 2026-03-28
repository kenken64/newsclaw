"use client";

import { useEffect, useRef, useState } from "react";

import { CheckCircle2, LoaderCircle, ServerCog, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RestoreJob = {
  id: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  stepLabel: string | null;
  progressPercent: number;
  errorMessage: string | null;
  rawOutput: string;
  deployId: string | null;
};

type Props = {
  initialRestoreJob: RestoreJob | null;
  missingConfig: string[];
  providerName: string;
  userEmail: string;
};

export function RestoreInstanceClient({ initialRestoreJob, missingConfig, providerName, userEmail }: Props) {
  const router = useRouter();
  const [restoreJob, setRestoreJob] = useState<RestoreJob | null>(initialRestoreJob);
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(
    Boolean(initialRestoreJob && ["pending", "running", "completed"].includes(initialRestoreJob.status))
  );
  const handoffStartedRef = useRef(false);
  const hasActiveRestore = Boolean(restoreJob && ["pending", "running"].includes(restoreJob.status));
  const restoreFailureMessage = restoreJob?.status === "failed" ? restoreJob.errorMessage : null;

  async function startRestore() {
    startedRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/provision/restore", { method: "POST" });
      const payload = (await response.json()) as { error?: string; restoreJob?: RestoreJob };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start the workspace restore.");
      }

      setRestoreJob(payload.restoreJob ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start the workspace restore.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRestore() {
    const confirmed = window.confirm(
      "Cancel the current restore and return to the setup page? The active OpenClaw workspace restore will be stopped.",
    );

    if (!confirmed) {
      return;
    }

    setCancelBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/provision/restore", { method: "DELETE" });
      const payload = (await response.json()) as { error?: string; restoreJob?: RestoreJob };

      if (!response.ok) {
        if (payload.error === "There is no active restore to cancel.") {
          goBackToSetup();
          return;
        }

        throw new Error(payload.error ?? "Unable to cancel the workspace restore.");
      }

      setRestoreJob(payload.restoreJob ?? null);
      startedRef.current = false;
      router.push("/setup-agent?edit=1");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to cancel the workspace restore.");
    } finally {
      setCancelBusy(false);
    }
  }

  function goBackToSetup() {
    router.push("/setup-agent?edit=1");
    router.refresh();
  }

  async function handleBackToSetup() {
    if (hasActiveRestore) {
      await cancelRestore();
      return;
    }

    goBackToSetup();
  }

  async function startPostRestorePairing() {
    if (handoffStartedRef.current) {
      return;
    }

    handoffStartedRef.current = true;

    try {
      await fetch("/api/provision/pairing", { method: "POST" });
    } catch {
      // The pairing screen can recover and retry if this eager handoff fails.
    } finally {
      router.push("/pair-channel");
      router.refresh();
    }
  }

  useEffect(() => {
    if (missingConfig.length > 0) {
      return;
    }

    async function ensureStarted() {
      if (startedRef.current) {
        return;
      }

      await startRestore();
    }

    void ensureStarted();
  }, [missingConfig]);

  useEffect(() => {
    if (!restoreJob || ["completed", "canceled", "failed"].includes(restoreJob.status)) {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch("/api/provision/restore", { cache: "no-store" });
      const payload = (await response.json()) as { restoreJob?: RestoreJob };

      if (payload.restoreJob) {
        setRestoreJob(payload.restoreJob);

        if (payload.restoreJob.status === "completed") {
          window.clearInterval(interval);
          void startPostRestorePairing();
        }
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [restoreJob, router]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
      <Card className="border-white/65 bg-white/92 shadow-[0_30px_100px_-40px_rgba(12,34,64,0.45)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Restore OpenClaw workspace</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-600">
            NewsClaw uses ClawMacdo to restore the {providerName} snapshot and capture the deployment metadata required for the pairing step.
          </CardDescription>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Restoring workspace for <span className="font-medium text-slate-950">{userEmail}</span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {missingConfig.length > 0 ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Missing configuration: {missingConfig.join(", ")}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {restoreFailureMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {restoreFailureMessage}
            </div>
          ) : null}

          <div className="flex justify-start">
            <Button onClick={() => void handleBackToSetup()} disabled={busy || cancelBusy} variant="outline" className="w-fit rounded-2xl">
              {cancelBusy ? <LoaderCircle className="animate-spin" /> : null}
              {hasActiveRestore ? "Cancel and return to setup" : "Back to setup"}
            </Button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Progress</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{restoreJob?.progressPercent ?? 0}%</p>
              </div>
              {restoreJob?.status === "completed" ? (
                <CheckCircle2 className="size-8 text-emerald-600" />
              ) : (
                <LoaderCircle className={`size-8 text-[color:var(--brand-ink)] ${busy || hasActiveRestore ? "animate-spin" : ""}`} />
              )}
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[color:var(--brand-ink)] transition-all" style={{ width: `${restoreJob?.progressPercent ?? 0}%` }} />
            </div>
            <p className="mt-4 text-sm text-slate-600">{restoreJob?.stepLabel ?? "Preparing restore job..."}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Latest output</p>
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {restoreJob?.rawOutput || "Waiting for ClawMacdo output..."}
            </pre>
          </div>

          {restoreJob?.status === "failed" ? (
            <Button onClick={() => void startRestore()} disabled={busy} className="w-fit rounded-2xl bg-[color:var(--brand-ink)] text-white hover:bg-[color:var(--brand-ink-strong)]">
              Retry restore
            </Button>
          ) : null}

          {hasActiveRestore ? (
            <div className="grid gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3 text-amber-900">
                <TriangleAlert className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">Canceling will stop the current restore.</p>
                  <p className="mt-1 text-sm leading-6 text-amber-800">
                    If you continue, NewsClaw will cancel the active restore job and send you back to the setup page.
                  </p>
                </div>
              </div>
              <Button onClick={() => void cancelRestore()} disabled={busy || cancelBusy} variant="outline" className="w-fit rounded-2xl border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
                {cancelBusy ? <LoaderCircle className="animate-spin" /> : <TriangleAlert />}
                Cancel restore and return to setup
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/60 bg-[linear-gradient(180deg,rgba(15,36,64,0.96),rgba(13,26,45,0.92))] text-white shadow-[0_30px_100px_-40px_rgba(12,34,64,0.55)]">
        <CardHeader>
          <CardTitle className="text-xl">Restore checklist</CardTitle>
          <CardDescription className="text-slate-300">The worker records the deploy id, hostname, IP address, and encrypted private key as soon as ClawMacdo finishes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 text-[color:var(--brand-highlight)]">
                <ServerCog className="size-5" />
              </div>
              <div>
                <p className="font-medium text-white">{providerName} snapshot</p>
                <p className="mt-1 text-slate-300">The restore runs against the pinned snapshot from the environment-selected provider and stores the resulting deployment record locally.</p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Account</p>
            <p className="mt-3 text-base font-medium text-white">{userEmail}</p>
            <p className="mt-1 text-slate-300">This restored workspace will be attached to this signed-in NewsClaw user.</p>
          </div>
          <p>Once the restore reaches 100%, NewsClaw moves into the user-specific pairing step automatically.</p>
        </CardContent>
      </Card>
    </div>
  );
}