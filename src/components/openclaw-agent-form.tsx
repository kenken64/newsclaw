"use client";

import { startTransition, useState } from "react";

import { Bot, Eye, EyeOff, LoaderCircle, LogOut, Radar, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  userName: string;
  initialAgent?: {
    agentName: string;
    trackingTopics: string[];
    region: string;
  };
  initialChannelConfig?: {
    preferredChannel: "whatsapp" | "telegram";
    whatsappPhoneNumber: string | null;
  };
  mode?: "create" | "edit";
};

const defaultTopics = [
  "AI regulation",
  "product launches",
  "enterprise security",
  "venture funding",
  "M&A",
];

function normalizeTopic(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseTopicBatch(value: string) {
  return value
    .split(/\n|,/)
    .map(normalizeTopic)
    .filter(Boolean);
}

function maskPhoneNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }

  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

export function OpenClawAgentForm({
  userName,
  initialAgent,
  initialChannelConfig,
  mode = "create",
}: Props) {
  const router = useRouter();
  const [agentName, setAgentName] = useState(
    initialAgent?.agentName ?? `${userName.split(" ")[0] || "News"} Signal Desk`
  );
  const [trackingTopics, setTrackingTopics] = useState<string[]>(
    initialAgent?.trackingTopics.length ? initialAgent.trackingTopics : defaultTopics
  );
  const [topicInput, setTopicInput] = useState("");
  const [region, setRegion] = useState(
    initialAgent?.region ?? "Asia, with emphasis on Southeast Asia"
  );
  const [preferredChannel, setPreferredChannel] = useState<"whatsapp" | "telegram">(
    initialChannelConfig?.preferredChannel ?? "whatsapp"
  );
  const [whatsAppPhoneNumber, setWhatsAppPhoneNumber] = useState(
    initialChannelConfig?.whatsappPhoneNumber ?? ""
  );
  const [showWhatsAppPhoneNumber, setShowWhatsAppPhoneNumber] = useState(false);
  const [isWhatsAppPhoneFocused, setIsWhatsAppPhoneFocused] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [showTelegramBotToken, setShowTelegramBotToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditMode = mode === "edit";

  async function parseJsonResponse(response: Response) {
    const responseText = await response.text();

    if (!responseText.trim()) {
      return null as { error?: string; nextPath?: string } | null;
    }

    try {
      return JSON.parse(responseText) as { error?: string; nextPath?: string };
    } catch {
      throw new Error(response.ok ? "Saved successfully, but the server returned an invalid response." : "The server returned an invalid response.");
    }
  }

  function addTopics(values: string[]) {
    if (values.length === 0) {
      return;
    }

    setTrackingTopics((currentTopics) => {
      const seen = new Set(currentTopics.map((topic) => topic.toLowerCase()));
      const nextTopics = [...currentTopics];

      for (const value of values) {
        const normalized = normalizeTopic(value);

        if (!normalized) {
          continue;
        }

        const key = normalized.toLowerCase();

        if (!seen.has(key)) {
          seen.add(key);
          nextTopics.push(normalized);
        }
      }

      return nextTopics;
    });
  }

  function commitTopicInput() {
    const nextTopics = parseTopicBatch(topicInput);
    addTopics(nextTopics);
    setTopicInput("");
  }

  function removeTopic(topicToRemove: string) {
    setTrackingTopics((currentTopics) =>
      currentTopics.filter((topic) => topic !== topicToRemove)
    );
  }

  async function handleSubmit() {
    const pendingTopics = parseTopicBatch(topicInput);
    const finalTopics = [...trackingTopics];

    for (const topic of pendingTopics) {
      if (!finalTopics.some((currentTopic) => currentTopic.toLowerCase() === topic.toLowerCase())) {
        finalTopics.push(topic);
      }
    }

    if (finalTopics.length === 0) {
      setError("Add at least one preferred topic before continuing.");
      return;
    }

    if (preferredChannel === "whatsapp" && !whatsAppPhoneNumber.trim()) {
      setError("Enter the WhatsApp phone number that should receive the pairing QR.");
      return;
    }

    if (preferredChannel === "telegram" && !telegramBotToken.trim() && !isEditMode) {
      setError("Enter the Telegram bot token for this user.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/openclaw-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentName,
          trackingTopics: finalTopics,
          region,
          preferredChannel,
          whatsAppPhoneNumber,
          telegramBotToken,
        }),
      });

      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save the OpenClaw agent.");
      }

      startTransition(() => {
        router.push(payload?.nextPath ?? "/dashboard");
        router.refresh();
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the OpenClaw agent.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExit() {
    setError(null);
    setExitBusy(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      startTransition(() => {
        router.push("/");
        router.refresh();
      });
    } finally {
      setExitBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
      <Card className="border-white/60 bg-white/92 shadow-[0_30px_100px_-40px_rgba(12,34,64,0.45)] backdrop-blur-xl">
        <CardHeader>
          <Badge className="w-fit rounded-full bg-[color:var(--brand-highlight)]/15 px-3 py-1 text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-highlight)]/15">
            {isEditMode ? "OpenClaw profile" : "OpenClaw onboarding"}
          </Badge>
          <CardTitle className="text-2xl">
            {isEditMode ? "Edit your news-searching agent" : "Configure your first news-searching agent"}
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
            {isEditMode
              ? "Update the preferred topics and region focus that drive your dashboard lanes and coverage map."
              : "This runs once for each user. Define the preferred topics and region focus so the dashboard can start from your coverage map."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="agent-name">Agent name</Label>
            <Input
              id="agent-name"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
              placeholder="Signal Desk"
              disabled={busy}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="topics">Preferred topics</Label>
            <div className="rounded-[22px] border border-input bg-background px-3 py-3 shadow-xs transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
              <div className="flex flex-wrap gap-2">
                {trackingTopics.map((topic) => (
                  <Badge
                    key={topic}
                    variant="secondary"
                    className="rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-2 text-slate-700 hover:bg-slate-50"
                  >
                    <span>{topic}</span>
                    <button
                      type="button"
                      className="ml-2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      onClick={() => removeTopic(topic)}
                      aria-label={`Remove ${topic}`}
                      disabled={busy}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <Input
                  id="topics"
                  value={topicInput}
                  onChange={(event) => setTopicInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      commitTopicInput();
                    }

                    if (
                      event.key === "Backspace" &&
                      topicInput.length === 0 &&
                      trackingTopics.length > 0
                    ) {
                      event.preventDefault();
                      removeTopic(trackingTopics[trackingTopics.length - 1]);
                    }
                  }}
                  onBlur={commitTopicInput}
                  onPaste={(event) => {
                    const pastedText = event.clipboardData.getData("text");

                    if (pastedText.includes(",") || pastedText.includes("\n")) {
                      event.preventDefault();
                      addTopics(parseTopicBatch(pastedText));
                    }
                  }}
                  className="h-8 min-w-40 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                  placeholder="Type a topic and press Enter"
                  disabled={busy}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">Press Enter or comma to create a topic chip. The coverage preview on the right updates as you type.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="region">Region focus</Label>
            <Input
              id="region"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="grid gap-3">
            <Label>Pairing channel</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  key: "whatsapp",
                  title: "WhatsApp",
                  description: "Scan a QR code after restore to attach this OpenClaw workspace.",
                },
                {
                  key: "telegram",
                  title: "Telegram",
                  description: "Use your own Telegram bot token and approve the challenge code after restore.",
                },
              ].map((option) => {
                const active = preferredChannel === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`rounded-[24px] border p-4 text-left transition ${
                      active
                        ? "border-[color:var(--brand-highlight)]/35 bg-[color:var(--brand-highlight)]/10"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                    onClick={() => setPreferredChannel(option.key as "whatsapp" | "telegram")}
                    disabled={busy}
                  >
                    <p className="font-medium text-slate-950">{option.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {preferredChannel === "whatsapp" ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="whatsapp-phone-number">WhatsApp phone number</Label>
                <div className="relative">
                  <Input
                    id="whatsapp-phone-number"
                    type={showWhatsAppPhoneNumber || isWhatsAppPhoneFocused ? "text" : "password"}
                    value={whatsAppPhoneNumber}
                    onChange={(event) => setWhatsAppPhoneNumber(event.target.value)}
                    onFocus={() => setIsWhatsAppPhoneFocused(true)}
                    onBlur={() => setIsWhatsAppPhoneFocused(false)}
                    placeholder="+6512345678"
                    className="pr-11"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setShowWhatsAppPhoneNumber((current) => !current)}
                    aria-label={showWhatsAppPhoneNumber ? "Hide WhatsApp phone number" : "Show WhatsApp phone number"}
                    aria-pressed={showWhatsAppPhoneNumber}
                    disabled={busy}
                  >
                    {showWhatsAppPhoneNumber ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">This number is passed to ClawMacdo during WhatsApp setup so the pairing QR is generated for the correct user.</p>
              </div>

              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
                <p className="font-medium">How to open WhatsApp linked devices</p>
                <ol className="mt-3 grid gap-2 pl-5 text-sm leading-6 text-emerald-900 list-decimal">
                  <li>Open WhatsApp on the phone that owns this number.</li>
                  <li>On Android, tap the three-dot menu. On iPhone, open Settings.</li>
                  <li>Choose Linked devices.</li>
                  <li>Tap Link a device and approve with Face ID, Touch ID, or device PIN.</li>
                  <li>After restore finishes, return here and scan the QR shown by NewsClaw.</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="telegram-bot-token">Telegram bot token</Label>
                <div className="relative">
                  <Input
                    id="telegram-bot-token"
                    type={showTelegramBotToken ? "text" : "password"}
                    value={telegramBotToken}
                    onChange={(event) => setTelegramBotToken(event.target.value)}
                    placeholder={isEditMode ? "Leave blank to keep the existing token" : "123456789:AA..."}
                    className="pr-11"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setShowTelegramBotToken((current) => !current)}
                    aria-label={showTelegramBotToken ? "Hide Telegram bot token" : "Show Telegram bot token"}
                    aria-pressed={showTelegramBotToken}
                    disabled={busy}
                  >
                    {showTelegramBotToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">Each user can provide a different bot token. The token is encrypted before it is stored.</p>
              </div>

              <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-950">
                <p className="font-medium">How to get a bot token from BotFather</p>
                <ol className="mt-3 grid gap-2 pl-5 text-sm leading-6 text-sky-900 list-decimal">
                  <li>Open Telegram and search for BotFather.</li>
                  <li>Open the verified BotFather chat and send <span className="font-mono">/newbot</span>.</li>
                  <li>Enter a display name for the bot, then choose a unique username ending in <span className="font-mono">bot</span>.</li>
                  <li>BotFather will reply with an HTTP API token in the format <span className="font-mono">123456789:AA...</span>.</li>
                  <li>Paste that token here. NewsClaw encrypts it before saving and uses it during Telegram pairing after restore.</li>
                </ol>
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {isEditMode
                ? "Saving here refreshes the dashboard lanes and the pairing channel configuration used after restore."
                : "You can revisit this setup later to adjust topics, region, and the messaging channel."}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="outline"
                size="lg"
                className="h-11 rounded-2xl px-6"
                onClick={handleExit}
                disabled={busy || exitBusy}
              >
                {exitBusy ? <LoaderCircle className="animate-spin" /> : <LogOut />}
                {isEditMode ? "Log out and return home" : "Log out to main page"}
              </Button>
              <Button
                size="lg"
                className="h-11 rounded-2xl bg-[color:var(--brand-ink)] px-6 text-white hover:bg-[color:var(--brand-ink-strong)]"
                onClick={handleSubmit}
                disabled={busy || exitBusy}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Bot />}
                {isEditMode ? "Update agent and return to dashboard" : "Continue"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/60 bg-[linear-gradient(180deg,rgba(15,36,64,0.96),rgba(13,26,45,0.92))] text-white shadow-[0_30px_100px_-40px_rgba(12,34,64,0.55)]">
        <CardHeader>
          <CardTitle className="text-xl">Live profile preview</CardTitle>
          <CardDescription className="text-slate-300">
            This setup becomes the basis for your agent dashboard and preferred coverage footprint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 text-[color:var(--brand-highlight)]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-sm text-slate-300">Agent identity</p>
                <p className="text-lg font-semibold">{agentName || "Signal Desk"}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {isEditMode
                ? "Preferred topics and region will refresh the dashboard lanes as soon as you save."
                : "Preferred topics and region shape the first version of your dashboard."}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
            <p className="font-medium text-white">Pairing channel</p>
            <p className="mt-2 text-lg font-semibold text-white">{preferredChannel === "whatsapp" ? "WhatsApp" : "Telegram"}</p>
            <p className="mt-2 leading-6">
              {preferredChannel === "whatsapp"
                ? (whatsAppPhoneNumber
                    ? maskPhoneNumber(whatsAppPhoneNumber)
                    : "Add a phone number to generate the pairing QR after restore.")
                : (telegramBotToken ? "Bot token ready to be encrypted and used for Telegram setup." : "Provide the bot token so the Telegram challenge flow can be started after restore.")}
            </p>
          </div>

          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Radar className="size-4 text-[color:var(--brand-highlight)]" />
              Coverage preview
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-400">Preferred topics</p>
              <p className="mb-3 text-sm text-slate-300">{trackingTopics.length} topic{trackingTopics.length === 1 ? "" : "s"} selected</p>
              <div className="flex flex-wrap gap-2">
                {trackingTopics.length > 0 ? trackingTopics.map((topic) => (
                  <Badge key={topic} className="rounded-full bg-[color:var(--brand-highlight)]/20 text-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight)]/20">
                    {topic}
                  </Badge>
                )) : <span className="text-sm text-slate-400">Add topics to preview coverage.</span>}
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-4">
                <span>Region</span>
                <span className="text-right text-white">{region}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Focus mode</span>
                <span className="text-right text-white">Topic-led</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}