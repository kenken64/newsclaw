"use client";

import { startTransition, useMemo, useState } from "react";

import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Newspaper,
  Sparkles,
} from "lucide-react";
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
import { NEWS_CATEGORIES, type NewsCategoryKey } from "@/lib/constants";

type Props = {
  userName: string;
  agentName: string;
  trackingTopics: string[];
  priorityLaneKeys: NewsCategoryKey[];
  selectedCategories: NewsCategoryKey[];
};

export function CategoryDashboard({
  userName,
  agentName,
  trackingTopics,
  priorityLaneKeys,
  selectedCategories,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<NewsCategoryKey[]>(selectedCategories);
  const [saving, setSaving] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestTime, setDigestTime] = useState("08:00");
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [digestSuccess, setDigestSuccess] = useState<string | null>(null);

  const priorityLaneLabels = useMemo(
    () => NEWS_CATEGORIES.filter((category) => priorityLaneKeys.includes(category.key)).map((category) => category.label),
    [priorityLaneKeys]
  );

  const chosenLabels = useMemo(
    () => NEWS_CATEGORIES.filter((category) => selected.includes(category.key)).map((category) => category.label),
    [selected]
  );

  async function persistSelection(nextCategories: NewsCategoryKey[]) {
    setSaving(true);

    try {
      const response = await fetch("/api/preferences/categories", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ categories: nextCategories }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save categories.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setSelected(selectedCategories);
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(categoryKey: NewsCategoryKey) {
    const nextCategories = selected.includes(categoryKey)
      ? selected.filter((item) => item !== categoryKey)
      : [...selected, categoryKey];

    setSelected(nextCategories);
    void persistSelection(nextCategories);
  }

  async function scheduleDailyDigest() {
    setDigestBusy(true);
    setDigestError(null);
    setDigestSuccess(null);

    try {
      const response = await fetch("/api/daily-digest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ time: digestTime }),
      });
      const payload = (await response.json()) as { error?: string; scheduledTime?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to schedule the daily digest.");
      }

      setDigestSuccess(`Daily digest scheduled for ${payload.scheduledTime ?? digestTime} UTC.`);
    } catch (caughtError) {
      setDigestError(caughtError instanceof Error ? caughtError.message : "Unable to schedule the daily digest.");
    } finally {
      setDigestBusy(false);
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
                Choose the categories your OpenClaw agent should emphasize. Your selections become the front page of the workspace and can be revised at any time.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Preferred topics</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{trackingTopics.length}</p>
                <p className="mt-2 text-sm text-slate-600">Themes currently steering the OpenClaw desk.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Coverage mode</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">Topic-led</p>
                <p className="mt-2 text-sm text-slate-600">Priority lanes are inferred from preferred topics and region instead of a generic feed.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Active categories</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{selected.length}</p>
                <p className="mt-2 text-sm text-slate-600">Focused lanes shown first in the dashboard.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {NEWS_CATEGORIES.map((category) => {
                const active = selected.includes(category.key);

                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => toggleCategory(category.key)}
                    className={`group rounded-[28px] border p-5 text-left transition ${
                      active
                        ? "border-[color:var(--brand-highlight)]/30 bg-[linear-gradient(180deg,rgba(254,245,224,1),rgba(255,255,255,1))] shadow-[0_18px_40px_-30px_rgba(12,34,64,0.5)]"
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_40px_-32px_rgba(12,34,64,0.3)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className={`rounded-2xl p-3 ${active ? "bg-[color:var(--brand-ink)] text-white" : "bg-slate-100 text-slate-700"}`}>
                        <Newspaper className="size-5" />
                      </div>
                      {active ? <CheckCircle2 className="size-5 text-[color:var(--brand-ink)]" /> : null}
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-slate-950">{category.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{category.description}</p>
                    <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[color:var(--brand-ink)]">
                      {active ? "Included in briefing" : "Add to briefing"}
                      <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-[linear-gradient(180deg,rgba(15,36,64,0.96),rgba(13,26,45,0.92))] text-white shadow-[0_30px_100px_-40px_rgba(12,34,64,0.55)]">
          <CardHeader>
            <CardTitle className="text-xl">Coverage summary</CardTitle>
            <CardDescription className="text-slate-300">
              NewsClaw is tuned for a curated brief instead of a generic feed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-3 text-[color:var(--brand-highlight)]">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-300">Priority lanes</p>
                  <p className="text-lg font-semibold">{priorityLaneLabels.length > 0 ? priorityLaneLabels.length : "None inferred yet"}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {priorityLaneLabels.length > 0 ? priorityLaneLabels.map((label) => (
                  <Badge key={label} className="rounded-full bg-[color:var(--brand-highlight)]/20 text-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight)]/20">
                    {label}
                  </Badge>
                )) : <p className="text-sm text-slate-400">Add preferred topics to infer the dashboard lanes.</p>}
              </div>
              <p className="mt-4 text-sm text-slate-300">These lanes are generated from the preferred topics and region saved in your OpenClaw profile.</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
              <p className="font-medium text-white">Preferred topics</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {trackingTopics.length > 0 ? trackingTopics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="rounded-full border border-white/10 bg-white/10 text-slate-100 hover:bg-white/10">
                    {topic}
                  </Badge>
                )) : <p className="text-sm text-slate-400">No preferred topics saved yet.</p>}
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-slate-300">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 text-[color:var(--brand-highlight)]" />}
              {saving ? "Saving category preferences..." : "Selections are saved instantly for your workspace."}
            </div>

            <div className="grid gap-3">
              <Button variant="outline" className="h-11 rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" asChild>
                <a href="/setup-agent?edit=1">Edit preferred topics</a>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setDigestOpen((current) => !current)}
              >
                <Clock3 className="size-4" />
                Daily Digest
              </Button>

              {digestOpen ? (
                <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="font-medium text-white">Schedule a daily prompt</p>
                  <p>Pick a daily UTC time. NewsClaw will send a cron-message prompt to the restored OpenClaw instance and deliver the response to the last active channel.</p>
                  <div className="grid gap-2">
                    <Label htmlFor="daily-digest-time" className="text-slate-200">Daily time (UTC)</Label>
                    <Input
                      id="daily-digest-time"
                      type="time"
                      value={digestTime}
                      onChange={(event) => setDigestTime(event.target.value)}
                      disabled={digestBusy}
                      className="border-white/15 bg-white/10 text-white [color-scheme:dark]"
                    />
                  </div>
                  {digestError ? <p className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-rose-200">{digestError}</p> : null}
                  {digestSuccess ? <p className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-200">{digestSuccess}</p> : null}
                  <Button
                    type="button"
                    onClick={() => void scheduleDailyDigest()}
                    disabled={digestBusy}
                    className="h-11 rounded-2xl bg-[color:var(--brand-highlight)] text-slate-950 hover:bg-[color:var(--brand-highlight)]/90"
                  >
                    {digestBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
                    Save daily digest
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}