import { ArrowUpRight, Bot, Compass, Radar, ScanSearch, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { PasskeyAuthPanel } from "@/components/passkey-auth-panel";
import { getPostAuthPath } from "@/lib/app-flow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getPostAuthPath(user.id));
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,212,113,0.28),transparent_30%),linear-gradient(180deg,#f6efe2_0%,#edf3f8_50%,#e6edf5_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(11,29,51,0.04),transparent_40%,rgba(255,255,255,0.35))]" />
      <div className="absolute right-[-8rem] top-[-5rem] h-80 w-80 rounded-full bg-[color:var(--brand-highlight)]/20 blur-3xl" />
      <div className="absolute left-[-10rem] bottom-[-8rem] h-96 w-96 rounded-full bg-[color:var(--brand-ink)]/10 blur-3xl" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[color:var(--brand-ink)] text-white shadow-lg shadow-[color:var(--brand-ink)]/20">
              <Bot className="size-5" />
            </div>
            <div>
              <p className="font-heading text-xl leading-none text-slate-950">NewsClaw</p>
              <p className="mt-1 text-sm text-slate-500">OpenClaw news agent workspace</p>
            </div>
          </div>
        </header>

        <div className="grid flex-1 items-start gap-8 py-8 lg:py-10 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,430px)] xl:gap-10">
          <div className="grid gap-6 lg:gap-8">
            <div className="space-y-6">
              <Badge className="w-fit rounded-full bg-[color:var(--brand-highlight)]/20 px-3 py-1 text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-highlight)]/20">
                Built for editorial monitoring
              </Badge>
              <div className="space-y-5">
                <h1 className="max-w-4xl font-heading text-4xl leading-[1.02] text-slate-950 sm:text-5xl lg:text-6xl">
                  An OpenClaw news agent that turns signal overload into a focused daily brief.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                  Configure source coverage, tune the categories that matter to your team, and shape a dashboard built for fast scanning, editorial judgment, and decision-ready updates.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Card className="border-white/70 bg-white/80 shadow-[0_24px_60px_-42px_rgba(12,34,64,0.32)] backdrop-blur-sm">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                    <Compass className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-950">Editorial direction</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Define the mission, regions, and coverage priorities your OpenClaw agent should watch.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/70 bg-white/80 shadow-[0_24px_60px_-42px_rgba(12,34,64,0.32)] backdrop-blur-sm">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                    <Radar className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-950">Source orchestration</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Blend trusted publishers, official channels, and topic lanes into one working brief.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/70 bg-white/80 shadow-[0_24px_60px_-42px_rgba(12,34,64,0.32)] backdrop-blur-sm sm:col-span-2 xl:col-span-1">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                    <ArrowUpRight className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-950">Category dashboards</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Turn broad monitoring into a clean front page organized around the categories your team actually follows.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_260px]">
              <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(12,34,64,0.96),rgba(22,57,99,0.92))] text-white shadow-[0_32px_90px_-42px_rgba(12,34,64,0.55)]">
                <CardContent className="grid gap-5 p-6 sm:p-7">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-white/10 p-3 text-[color:var(--brand-highlight)]">
                        <ScanSearch className="size-5" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Example briefing</p>
                        <p className="mt-1 text-lg font-semibold text-white">Morning signal desk</p>
                      </div>
                    </div>
                    <Badge className="rounded-full bg-white/10 text-slate-100 hover:bg-white/10">06:30 UTC</Badge>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
                    <p className="text-sm leading-7 text-slate-200">
                      “Three semiconductor suppliers issued margin warnings overnight, EU regulators reopened an AI compliance consultation, and two cloud vendors launched new inference pricing.”
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        "Urgent: supplier risk",
                        "Policy watch: EU AI",
                        "Pricing shift: cloud",
                      ].map((item) => (
                        <Badge key={item} className="rounded-full bg-[color:var(--brand-highlight)]/18 text-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight)]/18">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sources</p>
                      <p className="mt-2 text-xl font-semibold text-white">18</p>
                      <p className="mt-1 text-sm text-slate-300">Publisher and official channels monitored.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Coverage</p>
                      <p className="mt-2 text-xl font-semibold text-white">12</p>
                      <p className="mt-1 text-sm text-slate-300">Themes ranked by urgency and relevance.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Cadence</p>
                      <p className="mt-2 text-xl font-semibold text-white">4h</p>
                      <p className="mt-1 text-sm text-slate-300">Refresh rhythm for desk-ready updates.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/70 bg-white/82 shadow-[0_24px_60px_-42px_rgba(12,34,64,0.3)] backdrop-blur-sm">
                <CardContent className="grid gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[color:var(--brand-highlight)]/20 p-2 text-[color:var(--brand-ink)]">
                      <Sparkles className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Why teams use it</p>
                      <p className="text-sm text-slate-500">Built for fast morning reads.</p>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm leading-6 text-slate-600">
                    <p>Replace scattered tabs and newsletters with one curated monitoring desk.</p>
                    <p>Keep category pages tight, readable, and tuned to the lanes your team actually owns.</p>
                    <p>Move from setup to briefing without an admin-heavy workflow.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="xl:sticky xl:top-8">
            <PasskeyAuthPanel />
          </div>
        </div>
      </section>
    </main>
  );
}
