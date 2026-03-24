"use client";

import { useEffect, useRef, useState } from "react";

import { CheckCircle2, LoaderCircle, MessageCircleMore, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Pairing = {
  channel: "whatsapp" | "telegram";
  status: string;
  qrOutput: string;
  instructionText: string;
  pairingCode: string | null;
  errorMessage: string | null;
};

type Props = {
  preferredChannel: "whatsapp" | "telegram";
  initialPairing: Pairing | null;
};

export function MessagingPairingPanel({ preferredChannel, initialPairing }: Props) {
  const router = useRouter();
  const [pairing, setPairing] = useState<Pairing | null>(initialPairing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeCode, setChallengeCode] = useState("");
  const startedRef = useRef(Boolean(initialPairing && initialPairing.status !== "failed"));

  async function startPairing() {
    startedRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/provision/pairing", { method: "POST" });
      const payload = (await response.json()) as { error?: string; pairing?: Pairing };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start the pairing flow.");
      }

      setPairing(payload.pairing ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start the pairing flow.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    async function ensureStarted() {
      if (startedRef.current) {
        return;
      }

      await startPairing();
    }

    void ensureStarted();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const response = await fetch("/api/provision/pairing", { cache: "no-store" });
      const payload = (await response.json()) as { pairing?: Pairing };

      if (payload.pairing) {
        setPairing(payload.pairing);

        if (payload.pairing.status === "completed") {
          window.clearInterval(interval);
          router.push("/dashboard");
          router.refresh();
        }
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [router]);

  async function refreshWhatsAppQr() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/provision/pairing/refresh", { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to refresh the WhatsApp QR code.");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to refresh the WhatsApp QR code.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTelegramCode() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/provision/pairing/telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: challengeCode }),
      });
      const payload = (await response.json()) as { error?: string; pairing?: Pairing };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to verify the Telegram pairing code.");
      }

      setPairing(payload.pairing ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to verify the Telegram pairing code.");
    } finally {
      setBusy(false);
    }
  }

  const completed = pairing?.status === "completed";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
      <Card className="border-white/65 bg-white/92 shadow-[0_30px_100px_-40px_rgba(12,34,64,0.45)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Finish {preferredChannel === "whatsapp" ? "WhatsApp" : "Telegram"} pairing</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-600">
            NewsClaw uses the restored deployment record and your selected channel configuration to complete the messaging challenge for this user.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          {preferredChannel === "whatsapp" ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">WhatsApp QR</p>
              <pre className="mt-4 overflow-auto whitespace-pre text-sm leading-5 text-slate-800">{pairing?.qrOutput || "Waiting for QR output..."}</pre>
              <p className="mt-4 text-sm leading-6 text-slate-600">{pairing?.instructionText || "Scan the QR code with the WhatsApp app to finish channel setup."}</p>
              <Button onClick={refreshWhatsAppQr} disabled={busy} className="mt-5 rounded-2xl bg-[color:var(--brand-ink)] text-white hover:bg-[color:var(--brand-ink-strong)]">
                {busy ? <LoaderCircle className="animate-spin" /> : <QrCode />}
                Refresh QR code
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm leading-6 text-slate-700">{pairing?.instructionText || "Run /start on the Telegram bot, then paste the challenge code here."}</p>
              <div className="grid gap-2">
                <Label htmlFor="telegram-code">Telegram challenge code</Label>
                <Input
                  id="telegram-code"
                  value={challengeCode}
                  onChange={(event) => setChallengeCode(event.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  disabled={busy || completed}
                />
              </div>
              <Button onClick={submitTelegramCode} disabled={busy || completed || challengeCode.trim().length < 4} className="w-fit rounded-2xl bg-[color:var(--brand-ink)] text-white hover:bg-[color:var(--brand-ink-strong)]">
                {busy ? <LoaderCircle className="animate-spin" /> : <MessageCircleMore />}
                Approve challenge code
              </Button>
            </div>
          )}

          {completed ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Messaging pairing is complete. Redirecting to the dashboard.
            </div>
          ) : null}

          {pairing?.status === "failed" ? (
            <Button onClick={() => void startPairing()} disabled={busy} variant="outline" className="w-fit rounded-2xl">
              Restart pairing
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/60 bg-[linear-gradient(180deg,rgba(15,36,64,0.96),rgba(13,26,45,0.92))] text-white shadow-[0_30px_100px_-40px_rgba(12,34,64,0.55)]">
        <CardHeader>
          <CardTitle className="text-xl">Channel status</CardTitle>
          <CardDescription className="text-slate-300">The channel challenge is stored per user, so different users can connect different WhatsApp numbers or Telegram bots.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 text-[color:var(--brand-highlight)]">
                {completed ? <CheckCircle2 className="size-5" /> : <LoaderCircle className={`size-5 ${busy ? "animate-spin" : ""}`} />}
              </div>
              <div>
                <p className="font-medium text-white">Status</p>
                <p className="mt-1 text-slate-300">{pairing?.status ?? "Starting pairing..."}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}