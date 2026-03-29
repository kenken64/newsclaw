"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";

import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Phone,
  Trash2,
  RefreshCcw,
  ServerCrash,
  X,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

type Props = {
  userId: string;
  userName: string;
  agentName: string;
  trackingTopics: string[];
  initialDailyDigestSchedules: DailyDigestSchedule[];
  initialPreferredChannel: "whatsapp" | "telegram";
  initialDeliveryTarget: string;
  pairedChannels: Array<"whatsapp" | "telegram">;
};

type DailyDigestSchedule = {
  id: string;
  time: string;
  timezone: string;
  utcTime: string;
  jobName: string;
  deliveryChannel: "whatsapp" | "telegram";
  deliveryTarget: string;
  promptText: string;
};

type LiveCronRecord = {
  id: string;
  name: string;
  schedule: string;
  next: string;
  last: string;
  status: string;
  target: string;
  agentId: string;
  model: string;
};

function getCurrentSingaporeTime() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  });

  return formatter.format(new Date());
}

export function CategoryDashboard({
  userId,
  userName,
  agentName,
  trackingTopics,
  initialDailyDigestSchedules,
  initialPreferredChannel,
  initialDeliveryTarget,
  pairedChannels,
}: Props) {
  const [digestTime, setDigestTime] = useState("08:00");
  const [digestChannel, setDigestChannel] = useState<"whatsapp" | "telegram">(initialPreferredChannel);
  const [digestRecipient, setDigestRecipient] = useState(
    initialPreferredChannel === "whatsapp" ? initialDeliveryTarget.replace(/^\+65/, "") : initialDeliveryTarget
  );
  const [digestPrompt, setDigestPrompt] = useState("");
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestSchedules, setDigestSchedules] = useState<DailyDigestSchedule[]>(initialDailyDigestSchedules);
  const [digestRemovingId, setDigestRemovingId] = useState<string | null>(null);
  const [digestEditingId, setDigestEditingId] = useState<string | null>(null);
  const [digestEditingTime, setDigestEditingTime] = useState("");
  const [digestUpdatingId, setDigestUpdatingId] = useState<string | null>(null);
  const [telegramChatIdBusy, setTelegramChatIdBusy] = useState(false);
  const [liveCronLines, setLiveCronLines] = useState<string[]>([]);
  const [liveCronRecords, setLiveCronRecords] = useState<LiveCronRecord[]>([]);
  const [liveCronOutput, setLiveCronOutput] = useState<string>("Loading live cron jobs...");
  const [liveCronBusy, setLiveCronBusy] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isLiveCronModalOpen, setIsLiveCronModalOpen] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [digestSuccess, setDigestSuccess] = useState<string | null>(null);
  const [destroyBusy, setDestroyBusy] = useState(false);
  const [destroyConfirming, setDestroyConfirming] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairWhatsAppOpen, setRepairWhatsAppOpen] = useState(false);
  const [repairPhoneNumber, setRepairPhoneNumber] = useState(
    initialPreferredChannel === "whatsapp" ? initialDeliveryTarget.replace(/^\+65/, "") : ""
  );
  const [telegramPairOpen, setTelegramPairOpen] = useState(false);
  const [newBotToken, setNewBotToken] = useState("");
  const [telegramPairBusy, setTelegramPairBusy] = useState(false);
  const telegramChatIdStorageKey = `newsclaw.telegramChatId:${userId}`;
  const router = useRouter();

  async function destroyInstance() {
    setDestroyBusy(true);

    try {
      const response = await fetch("/api/provision/destroy", { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to destroy the instance.");
      }

      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch (caughtError) {
      setDigestError(caughtError instanceof Error ? caughtError.message : "Unable to destroy the instance.");
      setDestroyConfirming(false);
    } finally {
      setDestroyBusy(false);
    }
  }

  async function repairWhatsApp() {
    if (!/^[89]\d{7}$/.test(repairPhoneNumber.trim())) {
      setDigestError("Enter a valid Singapore mobile number (8 digits starting with 8 or 9).");
      return;
    }

    setRepairBusy(true);
    setDigestError(null);

    try {
      const response = await fetch("/api/provision/pairing/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp", whatsAppPhoneNumber: `+65${repairPhoneNumber.trim()}` }),
      });
      const payload = (await response.json()) as { error?: string; nextPath?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to reset WhatsApp pairing.");
      }

      setRepairWhatsAppOpen(false);
      router.push(payload.nextPath ?? "/pair-channel");
      router.refresh();
    } catch (caughtError) {
      setDigestError(caughtError instanceof Error ? caughtError.message : "Unable to reset WhatsApp pairing.");
    } finally {
      setRepairBusy(false);
    }
  }

  async function pairTelegram() {
    setTelegramPairBusy(true);
    setDigestError(null);

    try {
      const response = await fetch("/api/provision/pairing/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "telegram", telegramBotToken: newBotToken }),
      });
      const payload = (await response.json()) as { error?: string; nextPath?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to reset Telegram pairing.");
      }

      setTelegramPairOpen(false);
      setNewBotToken("");
      router.push(payload.nextPath ?? "/pair-channel");
      router.refresh();
    } catch (caughtError) {
      setDigestError(caughtError instanceof Error ? caughtError.message : "Unable to reset Telegram pairing.");
    } finally {
      setTelegramPairBusy(false);
    }
  }

  const deliveryTargetLabel = digestChannel === "telegram"
    ? "Telegram chat ID"
    : "WhatsApp number (Singapore)";
  const deliveryTargetPlaceholder = digestChannel === "telegram"
    ? "Numeric Telegram chat ID"
    : "91234567";

  async function resolveTelegramChatId() {
    if (typeof window !== "undefined") {
      const cachedChatId = window.localStorage.getItem(telegramChatIdStorageKey)?.trim() ?? "";

      if (cachedChatId) {
        setDigestRecipient(cachedChatId);
        return cachedChatId;
      }
    }

    setTelegramChatIdBusy(true);

    try {
      const response = await fetch("/api/daily-digest/telegram-chat-id", { cache: "no-store" });
      const payload = (await response.json()) as { error?: string; chatId?: string };

      if (!response.ok || !payload.chatId) {
        throw new Error(payload.error ?? "Unable to fetch the Telegram chat ID.");
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(telegramChatIdStorageKey, payload.chatId);
      }

      setDigestRecipient(payload.chatId);
      return payload.chatId;
    } finally {
      setTelegramChatIdBusy(false);
    }
  }

  async function refreshLiveCronJobs() {
    setLiveCronBusy(true);

    try {
      const response = await fetch("/api/daily-digest", { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        remoteRemoved?: boolean;
        removedJobName?: string;
        warning?: string;
        schedules?: DailyDigestSchedule[];
        liveCronLines?: string[];
        liveCronRecords?: LiveCronRecord[];
        liveCronOutput?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load live cron jobs.");
      }

      setDigestSchedules(payload.schedules ?? []);
      setLiveCronLines(payload.liveCronLines ?? []);
      setLiveCronRecords(payload.liveCronRecords ?? []);
      setLiveCronOutput(payload.liveCronOutput ?? "No cron jobs.");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to load live cron jobs.";
      setLiveCronLines([]);
      setLiveCronRecords([]);
      setLiveCronOutput(message);
      setDigestError(message);
    } finally {
      setLiveCronBusy(false);
    }
  }

  useEffect(() => {
    setHasMounted(true);
    setDigestTime(getCurrentSingaporeTime());
  }, []);

  useEffect(() => {
    if (!hasMounted || initialPreferredChannel !== "telegram") {
      return;
    }

    void resolveTelegramChatId().catch((caughtError) => {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to fetch the Telegram chat ID.";
      setDigestError(message);
    });
  }, [hasMounted, initialPreferredChannel]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    void refreshLiveCronJobs();
  }, [hasMounted]);

  useEffect(() => {
    if (!isLiveCronModalOpen) {
      return;
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLiveCronModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isLiveCronModalOpen]);

  async function scheduleDailyDigest() {
    setDigestBusy(true);
    setDigestError(null);
    setDigestSuccess(null);

    try {
      let recipient: string;

      if (digestChannel === "telegram") {
        recipient = await resolveTelegramChatId();
      } else {
        if (!/^[89]\d{7}$/.test(digestRecipient.trim())) {
          setDigestError("Enter a valid Singapore mobile number (8 digits starting with 8 or 9).");
          setDigestBusy(false);
          return;
        }
        recipient = `+65${digestRecipient.trim()}`;
      }

      const response = await fetch("/api/daily-digest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ time: digestTime, channel: digestChannel, recipient, prompt: digestPrompt }),
      });
      const payload = (await response.json()) as {
        error?: string;
        scheduledTime?: string;
        scheduledTimezone?: string;
        scheduledUtcTime?: string;
        deliveryChannel?: "whatsapp" | "telegram";
        deliveryTarget?: string;
        schedules?: DailyDigestSchedule[];
        liveCronLines?: string[];
        liveCronRecords?: LiveCronRecord[];
        liveCronOutput?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to schedule the daily digest.");
      }

      setDigestSchedules(payload.schedules ?? digestSchedules);
      setDigestPrompt("");

      setDigestSuccess(
        `Daily digest scheduled for ${payload.scheduledTime ?? digestTime} SGT (${payload.scheduledUtcTime ?? digestTime} UTC) via ${payload.deliveryChannel ?? initialPreferredChannel} to ${payload.deliveryTarget ?? recipient}.`
      );

      void refreshLiveCronJobs();
    } catch (caughtError) {
      setDigestError(caughtError instanceof Error ? caughtError.message : "Unable to schedule the daily digest.");
    } finally {
      setDigestBusy(false);
    }
  }

  async function removeDailyDigestSchedule(scheduleId: string) {
    setDigestRemovingId(scheduleId);
    setDigestError(null);
    setDigestSuccess(null);

    try {
      const response = await fetch("/api/daily-digest", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: scheduleId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        remoteRemoved?: boolean;
        removedJobName?: string;
        warning?: string;
        schedules?: DailyDigestSchedule[];
        liveCronLines?: string[];
        liveCronRecords?: LiveCronRecord[];
        liveCronOutput?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove the daily digest.");
      }

      setDigestSchedules(payload.schedules ?? []);
      setDigestSuccess(
        payload.remoteRemoved
          ? `Daily digest removed. OpenClaw cron job ${payload.removedJobName ?? ""} was deleted as well.`.trim()
          : payload.warning ?? "Daily digest removed."
      );

      void refreshLiveCronJobs();
    } catch (caughtError) {
      setDigestError(caughtError instanceof Error ? caughtError.message : "Unable to remove the daily digest.");
    } finally {
      setDigestRemovingId(null);
    }
  }

  async function updateDailyDigestScheduleTime(scheduleId: string) {
    setDigestUpdatingId(scheduleId);
    setDigestError(null);
    setDigestSuccess(null);

    try {
      const response = await fetch("/api/daily-digest", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: scheduleId, time: digestEditingTime }),
      });
      const payload = (await response.json()) as {
        error?: string;
        updatedTime?: string;
        updatedUtcTime?: string;
        schedules?: DailyDigestSchedule[];
        liveCronLines?: string[];
        liveCronRecords?: LiveCronRecord[];
        liveCronOutput?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update the daily digest time.");
      }

      setDigestSchedules(payload.schedules ?? []);
      setDigestEditingId(null);
      setDigestEditingTime("");
      setDigestSuccess(
        `Daily digest updated to ${payload.updatedTime ?? digestEditingTime} SGT (${payload.updatedUtcTime ?? digestEditingTime} UTC).`
      );

      void refreshLiveCronJobs();
    } catch (caughtError) {
      setDigestError(caughtError instanceof Error ? caughtError.message : "Unable to update the daily digest time.");
    } finally {
      setDigestUpdatingId(null);
    }
  }

  function handleDigestPromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void scheduleDailyDigest();
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <Card className="border-white/65 bg-white/92 shadow-[0_30px_100px_-40px_rgba(12,34,64,0.45)] backdrop-blur-xl">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full bg-[color:var(--brand-highlight)]/15 px-3 py-1 text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-highlight)]/15">
                Dashboard ready
              </Badge>
              <Badge variant="outline" className="rounded-full border-[color:var(--brand-ink)]/15 px-3 py-1 text-[color:var(--brand-ink)]">
                {agentName}
              </Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl">Welcome back, {userName.split(" ")[0]}</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6 text-slate-600">
                Your OpenClaw agent is driven directly by the preferred topics saved on the profile. The dashboard shows those topics instead of a second category layer.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Preferred topics</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{trackingTopics.length}</p>
                <p className="mt-2 text-sm text-slate-600">Themes currently steering the OpenClaw desk.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Coverage mode</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">Topic-led</p>
                <p className="mt-2 text-sm text-slate-600">Skills, summaries, and prompts are generated from the saved preferred topics and region.</p>
              </div>
            </div>

            <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_40px_-32px_rgba(12,34,64,0.2)]">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-slate-950">Daily digests</h2>
                <p>Add as many daily digest times as you need. Every saved time runs once per day in Singapore time (SGT, UTC+8).</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="daily-digest-time" className="text-slate-700">Add daily time (Singapore, SGT)</Label>
                <form
                  className="grid gap-3"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void scheduleDailyDigest();
                  }}
                >
                  <div className="relative">
                    <Input
                      id="daily-digest-time"
                      type="time"
                      value={digestTime}
                      onChange={(event) => setDigestTime(event.target.value)}
                      disabled={digestBusy}
                      className="border-slate-200 bg-slate-50 pr-11 text-slate-950"
                    />
                    <button
                      type="submit"
                      disabled={digestBusy}
                      aria-label="Add daily digest"
                      title="Add daily digest"
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 transition hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {digestBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
                    </button>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="daily-digest-prompt" className="text-slate-700">Prompt</Label>
                    <Textarea
                      id="daily-digest-prompt"
                      value={digestPrompt}
                      onChange={(event) => setDigestPrompt(event.target.value)}
                      onKeyDown={handleDigestPromptKeyDown}
                      disabled={digestBusy}
                      placeholder="Optional instructions for this daily digest, such as format, focus areas, or output style."
                      className="min-h-24 border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                    />
                  </div>
                  {pairedChannels.length > 1 ? (
                    <div className="grid gap-2">
                      <Label htmlFor="daily-digest-channel" className="text-slate-700">Delivery channel</Label>
                      <select
                        id="daily-digest-channel"
                        value={digestChannel}
                        onChange={(event) => setDigestChannel(event.target.value as "whatsapp" | "telegram")}
                        disabled={digestBusy}
                        className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-950"
                      >
                        {pairedChannels.includes("whatsapp") ? <option value="whatsapp">WhatsApp</option> : null}
                        {pairedChannels.includes("telegram") ? <option value="telegram">Telegram</option> : null}
                      </select>
                    </div>
                  ) : null}
                  {digestChannel === "telegram" ? (
                    <div className="grid gap-2">
                      <Label className="text-slate-700">Telegram chat ID</Label>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        {telegramChatIdBusy
                          ? "Fetching Telegram chat ID from OpenClaw..."
                          : digestRecipient
                            ? `Using Telegram chat ID ${digestRecipient}`
                            : "Telegram chat ID will be fetched from OpenClaw before saving."}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label htmlFor="daily-digest-recipient" className="text-slate-700">{deliveryTargetLabel}</Label>
                      <div className="flex">
                        <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-200 bg-slate-100 px-3 text-sm text-slate-600">+65</span>
                        <Input
                          id="daily-digest-recipient"
                          type="text"
                          value={digestRecipient}
                          onChange={(event) => {
                            const value = event.target.value.replace(/\D/g, "").slice(0, 8);
                            setDigestRecipient(value);
                          }}
                          disabled={digestBusy}
                          placeholder={deliveryTargetPlaceholder}
                          maxLength={8}
                          inputMode="numeric"
                          className="rounded-l-none border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  )}
                </form>
                <p className="text-xs text-slate-500">
                  {digestChannel === "telegram"
                    ? "Telegram chat ID is loaded from local storage when available, otherwise fetched from OpenClaw before saving. Press Enter in the time field, or Cmd/Ctrl + Enter in the prompt field, to add this daily digest."
                    : "Singapore mobile number (8 digits starting with 8 or 9). Press Enter in the time field, or Cmd/Ctrl + Enter in the prompt field, to add this daily digest."}
                </p>
              </div>
              <div className="grid gap-2">
                {digestSchedules.length > 0 ? digestSchedules.map((schedule) => (
                  <div key={schedule.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="min-w-0">
                      {digestEditingId === schedule.id ? (
                        <div className="grid gap-2">
                          <Label htmlFor={`digest-edit-${schedule.id}`} className="text-xs text-slate-700">Schedule time</Label>
                          <Input
                            id={`digest-edit-${schedule.id}`}
                            type="time"
                            value={digestEditingTime}
                            onChange={(event) => setDigestEditingTime(event.target.value)}
                            disabled={digestUpdatingId === schedule.id || digestBusy}
                            className="h-9 w-40 border-slate-200 bg-white text-slate-950"
                          />
                        </div>
                      ) : (
                        <p className="font-medium text-slate-950">{schedule.time} SGT</p>
                      )}
                      <p className="text-xs text-slate-500">{schedule.utcTime} UTC</p>
                      <p className="text-xs text-slate-500">
                        {schedule.deliveryChannel === "telegram" ? "Telegram" : "WhatsApp"}: {schedule.deliveryTarget || "Legacy target"}
                      </p>
                      {schedule.promptText ? <p className="mt-2 text-xs leading-5 text-slate-600">{schedule.promptText}</p> : null}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {digestEditingId === schedule.id ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void updateDailyDigestScheduleTime(schedule.id)}
                            disabled={digestUpdatingId === schedule.id || digestBusy || !digestEditingTime}
                            className="h-9 rounded-2xl border-slate-200 bg-white px-3 text-slate-950 hover:bg-slate-100 hover:text-slate-950"
                          >
                            {digestUpdatingId === schedule.id ? <LoaderCircle className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
                            Save time
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setDigestEditingId(null);
                              setDigestEditingTime("");
                            }}
                            disabled={digestUpdatingId === schedule.id || digestBusy}
                            className="h-9 rounded-2xl border-slate-200 bg-white px-3 text-slate-950 hover:bg-slate-100 hover:text-slate-950"
                          >
                            <X className="size-4" />
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setDigestEditingId(schedule.id);
                            setDigestEditingTime(schedule.time);
                            setDigestError(null);
                            setDigestSuccess(null);
                          }}
                          disabled={digestBusy || digestRemovingId === schedule.id}
                          className="h-9 rounded-2xl border-slate-200 bg-white px-3 text-slate-950 hover:bg-slate-100 hover:text-slate-950"
                        >
                          <Clock3 className="size-4" />
                          Edit time
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void removeDailyDigestSchedule(schedule.id)}
                        disabled={digestRemovingId === schedule.id || digestBusy || digestEditingId === schedule.id}
                        className="h-9 rounded-2xl border-slate-200 bg-white px-3 text-slate-950 hover:bg-slate-100 hover:text-slate-950"
                      >
                        {digestRemovingId === schedule.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        Remove
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-slate-500">
                    No daily digests scheduled yet.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsLiveCronModalOpen(true)}
                  className="h-11 rounded-2xl border-slate-200 bg-white text-slate-950 hover:bg-slate-100 hover:text-slate-950"
                >
                  <RefreshCcw className="size-4" />
                  View live OpenClaw schedules
                </Button>
                {digestError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">{digestError}</p> : null}
                {digestSuccess ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">{digestSuccess}</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-[linear-gradient(180deg,rgba(15,36,64,0.96),rgba(13,26,45,0.92))] text-white shadow-[0_30px_100px_-40px_rgba(12,34,64,0.55)]">
          <CardHeader>
            <CardTitle className="text-xl">Agent summary</CardTitle>
            <CardDescription className="text-slate-300">
              NewsClaw is tuned directly from your saved preferred topics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
              <p className="font-medium text-white">Preferred topics</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {trackingTopics.length > 0 ? trackingTopics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="rounded-full border border-white/10 bg-white/10 text-slate-100 hover:bg-white/10">
                    {topic}
                  </Badge>
                )) : <p className="text-sm text-slate-400">No preferred topics saved yet.</p>}
              </div>
              <p className="mt-4 text-sm text-slate-300">These topics are what the skill bundle and daily digest prompts use as their editorial input.</p>
            </div>

            <div className="grid gap-3">
              <Button variant="outline" className="h-11 rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" asChild>
                <a href="/setup-agent?edit=1">Edit preferred topics</a>
              </Button>
              <AlertDialog open={telegramPairOpen} onOpenChange={setTelegramPairOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl border-sky-400/20 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 hover:text-sky-100"
                  >
                    <MessageCircle className="size-4" />
                    Pair Telegram
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl border-slate-200 bg-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Pair Telegram bot</AlertDialogTitle>
                    <AlertDialogDescription>
                      Enter a new Telegram bot token to re-pair with a different bot. This will reset the current pairing and redirect you to the pairing flow.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="new-bot-token" className="text-sm text-slate-700">Bot token</Label>
                    <Input
                      id="new-bot-token"
                      type="text"
                      value={newBotToken}
                      onChange={(event) => setNewBotToken(event.target.value)}
                      disabled={telegramPairBusy}
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                      className="border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={telegramPairBusy} className="rounded-2xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => { e.preventDefault(); void pairTelegram(); }}
                      disabled={telegramPairBusy || !newBotToken.trim()}
                      className="rounded-2xl bg-sky-600 text-white hover:bg-sky-700"
                    >
                      {telegramPairBusy ? <LoaderCircle className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
                      Pair
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog open={repairWhatsAppOpen} onOpenChange={setRepairWhatsAppOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100"
                    disabled={repairBusy}
                  >
                    {repairBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}
                    Repair WhatsApp
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl border-slate-200 bg-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Repair WhatsApp pairing</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset the current WhatsApp pairing and redirect you to scan a new QR code. Use this if your WhatsApp connection has broken.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="repair-phone-number" className="text-sm text-slate-700">WhatsApp number (Singapore)</Label>
                    <div className="flex">
                      <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-200 bg-slate-100 px-3 text-sm text-slate-600">+65</span>
                      <Input
                        id="repair-phone-number"
                        type="text"
                        value={repairPhoneNumber}
                        onChange={(event) => {
                          const value = event.target.value.replace(/\D/g, "").slice(0, 8);
                          setRepairPhoneNumber(value);
                        }}
                        disabled={repairBusy}
                        placeholder="91234567"
                        maxLength={8}
                        inputMode="numeric"
                        className="rounded-l-none border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400"
                      />
                    </div>
                    <p className="text-xs text-slate-500">Singapore mobile number (8 digits starting with 8 or 9).</p>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={repairBusy} className="rounded-2xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => { e.preventDefault(); void repairWhatsApp(); }}
                      disabled={repairBusy || !/^[89]\d{7}$/.test(repairPhoneNumber.trim())}
                      className="rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {repairBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}
                      Repair
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog open={destroyConfirming} onOpenChange={setDestroyConfirming}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
                  >
                    <ServerCrash className="size-4" />
                    Destroy instance
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl border-slate-200 bg-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Destroy instance?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently destroy the cloud instance and reset your account back to setup. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={destroyBusy} className="rounded-2xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => { e.preventDefault(); void destroyInstance(); }}
                      disabled={destroyBusy}
                      className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700"
                    >
                      {destroyBusy ? <LoaderCircle className="size-4 animate-spin" /> : <ServerCrash className="size-4" />}
                      Destroy
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLiveCronModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
          onClick={() => setIsLiveCronModalOpen(false)}
        >
          <div
            className="w-full max-w-5xl rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,36,64,0.98),rgba(13,26,45,0.96))] shadow-[0_30px_100px_-40px_rgba(12,34,64,0.7)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-white">Live OpenClaw schedules</h2>
                <p className="mt-1 text-sm text-slate-300">Live cron jobs fetched directly from `clawmacdo cron-list`.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refreshLiveCronJobs()}
                  disabled={liveCronBusy || !hasMounted}
                  className="h-9 rounded-2xl border-white/15 bg-white/5 px-3 text-white hover:bg-white/10 hover:text-white"
                >
                  {liveCronBusy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsLiveCronModalOpen(false)}
                  className="h-9 w-9 rounded-2xl border-white/15 bg-white/5 p-0 text-white hover:bg-white/10 hover:text-white"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              {!hasMounted ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
                  Loading live schedules...
                </p>
              ) : liveCronRecords.length > 0 ? (
                <div className="overflow-auto rounded-3xl border border-white/10 bg-white/5">
                  <table className="min-w-[980px] w-full border-collapse text-left text-sm text-slate-200">
                    <thead className="sticky top-0 bg-[rgba(14,28,49,0.96)] text-xs uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
                      <tr>
                        <th className="px-4 py-3 font-medium">ID</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Schedule</th>
                        <th className="px-4 py-3 font-medium">Next</th>
                        <th className="px-4 py-3 font-medium">Last</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Target</th>
                        <th className="px-4 py-3 font-medium">Agent ID</th>
                        <th className="px-4 py-3 font-medium">Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveCronRecords.map((record, index) => (
                        <tr key={`${record.id}-${record.name}-${index}`} className="border-t border-white/10 align-top">
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{record.id}</td>
                          <td className="px-4 py-3">
                            <p className="max-w-[220px] truncate font-medium text-white">{record.name}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-300">{record.schedule}</td>
                          <td className="px-4 py-3 text-slate-300">{record.next}</td>
                          <td className="px-4 py-3 text-slate-400">{record.last}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${record.status === "idle" ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : record.status === "error" ? "border border-rose-400/20 bg-rose-400/10 text-rose-200" : "border border-white/15 bg-white/5 text-slate-200"}`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{record.target}</td>
                          <td className="px-4 py-3 text-slate-400">{record.agentId}</td>
                          <td className="px-4 py-3 text-slate-400">{record.model}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
                  {liveCronOutput}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}