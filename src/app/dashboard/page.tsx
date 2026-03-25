import { Bot, Database, LayoutGrid } from "lucide-react";
import { redirect } from "next/navigation";

import { getPostAuthPath } from "@/lib/app-flow";
import { CategoryDashboard } from "@/components/category-dashboard";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getDailyDigestSchedulesByUserId,
  getOpenClawAgentByUserId,
  getUserChannelConfigByUserId,
} from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();
  const nextPath = getPostAuthPath(user.id);

  if (nextPath !== "/dashboard") {
    redirect(nextPath);
  }

  const agent = getOpenClawAgentByUserId(user.id);
  const channelConfig = getUserChannelConfigByUserId(user.id);

  if (!agent) {
    redirect("/setup-agent");
  }

  const dailyDigestSchedules = getDailyDigestSchedulesByUserId(user.id).map((schedule) => ({
    id: schedule.id,
    time: schedule.timeSgt,
    timezone: "Asia/Singapore",
    utcTime: schedule.timeUtc,
    jobName: schedule.jobName,
    deliveryChannel: schedule.deliveryChannel,
    deliveryTarget: schedule.deliveryTarget,
    promptText: schedule.promptText,
  }));
  const initialDeliveryTarget = channelConfig?.preferredChannel === "whatsapp"
    ? (channelConfig.whatsappPhoneNumber ?? "")
    : "";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,212,113,0.18),transparent_28%),linear-gradient(180deg,#eef4f8_0%,#e8eef4_100%)] px-6 py-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8">
        <header className="flex flex-col gap-5 rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(12,34,64,0.95),rgba(20,53,96,0.92))] p-6 text-white shadow-[0_30px_100px_-50px_rgba(12,34,64,0.5)] lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <Badge className="w-fit rounded-full bg-white/10 px-3 py-1 text-white hover:bg-white/10">
              OpenClaw agent active
            </Badge>
            <div>
              <h1 className="font-heading text-4xl">NewsClaw dashboard</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Your OpenClaw brief is configured, and your category preferences are ready for immediate reuse across the workspace.
              </p>
            </div>
          </div>
          <SignOutButton />
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/70 bg-white/80">
            <CardContent className="flex gap-4 p-5">
              <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                <Bot className="size-5" />
              </div>
              <div>
                <p className="font-medium text-slate-950">Agent</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{agent.agentName}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-white/70 bg-white/80">
            <CardContent className="flex gap-4 p-5">
              <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                <LayoutGrid className="size-5" />
              </div>
              <div>
                <p className="font-medium text-slate-950">Preferred topics</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{agent.trackingTopics.length > 0 ? agent.trackingTopics.length : "No preferred topics yet"}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-white/70 bg-white/80">
            <CardContent className="flex gap-4 p-5">
              <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                <Database className="size-5" />
              </div>
              <div>
                <p className="font-medium text-slate-950">Persistence</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Your workspace, agent configuration, and preferred topics are stored locally for quick reuse.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <CategoryDashboard
          userId={user.id}
          userName={user.name}
          agentName={agent.agentName}
          trackingTopics={agent.trackingTopics}
          initialDailyDigestSchedules={dailyDigestSchedules}
          initialPreferredChannel={channelConfig?.preferredChannel ?? "whatsapp"}
          initialDeliveryTarget={initialDeliveryTarget}
        />
      </div>
    </main>
  );
}