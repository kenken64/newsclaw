"use client";

import { useEffect, useRef, useState } from "react";

import { CheckCircle2, LoaderCircle, MessageCircleMore, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { drawQrRowsToCanvas, extractLastQrBlock, parseQrTextToRows } from "@/lib/whatsapp-qr";

type Pairing = {
  channel: "whatsapp" | "telegram";
  status: string;
  qrOutput: string;
  instructionText: string;
  pairingCode: string | null;
  errorMessage: string | null;
  lastUpdatedAt?: string | null;
};

type Props = {
  preferredChannel: "whatsapp" | "telegram";
  initialPairing: Pairing | null;
  userEmail: string;
};

export function MessagingPairingPanel({ preferredChannel, initialPairing, userEmail }: Props) {
  const router = useRouter();
  const [pairing, setPairing] = useState<Pairing | null>(initialPairing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeCode, setChallengeCode] = useState("");
  const [qrCountdown, setQrCountdown] = useState<number | null>(null);
  const canReuseInitialPairing = Boolean(
    initialPairing &&
      (
        initialPairing.status === "completed" ||
        initialPairing.status === "fetching_qr" ||
        initialPairing.status === "qr_ready" ||
        (
          initialPairing.status === "awaiting_code" &&
          !initialPairing.pairingCode &&
          !initialPairing.errorMessage
        )
      )
  );
  const startedRef = useRef(canReuseInitialPairing);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  function goToDashboard() {
    router.push("/dashboard");
    router.refresh();
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
        }
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [router]);

  useEffect(() => {
    const qrOutput = pairing?.qrOutput ?? "";
    const canvas = qrCanvasRef.current;

    if (!canvas) {
      return;
    }

    const rows = parseQrTextToRows(qrOutput);

    if (!rows) {
      const context = canvas.getContext("2d");

      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }

      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    drawQrRowsToCanvas(canvas, rows, { scale: 7, quietZone: 4 });
  }, [pairing?.qrOutput]);

  useEffect(() => {
    if (!pairing?.lastUpdatedAt || preferredChannel !== "whatsapp" || pairing.status !== "qr_ready") {
      setQrCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const expiresAt = new Date(pairing.lastUpdatedAt!).getTime() + 60_000;
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setQrCountdown(remainingSeconds);
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(interval);
  }, [pairing?.lastUpdatedAt, pairing?.status, preferredChannel]);

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
  const animatedStatus = !completed && pairing?.status !== "failed";
  const extractedQrOutput = pairing?.qrOutput ? extractLastQrBlock(pairing.qrOutput) : "";
  const hasRenderedQr = Boolean(parseQrTextToRows(pairing?.qrOutput ?? ""));
  const hasExtraOutput = Boolean(pairing?.qrOutput && pairing.qrOutput.trim() !== extractedQrOutput.trim());

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
              <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_-35px_rgba(12,34,64,0.45)]">
                {hasRenderedQr ? (
                  <div className="flex flex-col items-center gap-3">
                    <canvas ref={qrCanvasRef} className="max-w-full rounded-2xl border border-slate-200 bg-white" />
                    <p className="text-xs text-slate-500">
                      {qrCountdown !== null
                        ? qrCountdown > 0
                          ? `QR refresh window: ${qrCountdown}s`
                          : "QR may have expired. Refresh to generate a new code."
                        : "Scan with WhatsApp Linked Devices."}
                    </p>
                  </div>
                ) : (
                  <pre className="overflow-auto whitespace-pre text-sm leading-5 text-slate-800">{extractedQrOutput || "Waiting for QR output..."}</pre>
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{pairing?.instructionText || "Scan the QR code with the WhatsApp app to finish channel setup."}</p>
              {pairing?.errorMessage ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {pairing.errorMessage}
                </div>
              ) : null}
              {pairing?.qrOutput ? (
                <details className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <summary className="cursor-pointer font-medium text-slate-900">
                    {hasExtraOutput ? "Show raw QR command output" : "Show QR text output"}
                  </summary>
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{pairing.qrOutput}</pre>
                </details>
              ) : null}
              {hasRenderedQr && !completed ? (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  <LoaderCircle className="size-4 animate-spin shrink-0" />
                  Waiting for WhatsApp to connect. Scan the QR code and it will be detected automatically.
                </div>
              ) : null}
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
                  onChange={(event) => setChallengeCode(event.target.value)}
                  placeholder="Paste the code from Telegram"
                  maxLength={128}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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
            <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <p>Messaging pairing is complete. The channel is ready.</p>
              <Button onClick={goToDashboard} className="w-fit rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700">
                Continue to dashboard
              </Button>
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
                {completed ? <CheckCircle2 className="size-5" /> : <LoaderCircle className={`size-5 ${animatedStatus ? "animate-spin" : ""}`} />}
              </div>
              <div>
                <p className="font-medium text-white">Status</p>
                <p className="mt-1 text-slate-300">{pairing?.status ?? "Starting pairing..."}</p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Account</p>
            <p className="mt-2 break-all font-medium text-white">{userEmail}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}