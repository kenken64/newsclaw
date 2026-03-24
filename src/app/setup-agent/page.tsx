import { Bot, Compass, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { OpenClawAgentForm } from "@/components/openclaw-agent-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPostAuthPath } from "@/lib/app-flow";
import { getOpenClawAgentByUserId, getUserChannelConfigByUserId } from "@/lib/db";
import { requireUser } from "@/lib/session";

type SetupAgentPageProps = {
  searchParams?: Promise<{
    edit?: string;
  }>;
};

export default async function SetupAgentPage({ searchParams }: SetupAgentPageProps) {
  const user = await requireUser();
  const existingAgent = getOpenClawAgentByUserId(user.id);
  const channelConfig = getUserChannelConfigByUserId(user.id);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const editMode = resolvedSearchParams?.edit === "1";

  if (existingAgent && !editMode) {
    redirect(getPostAuthPath(user.id));
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,212,113,0.2),transparent_32%),linear-gradient(180deg,#eef4f8_0%,#e8eef4_100%)] px-6 py-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8">
        <header className="flex flex-col gap-5 rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-[0_30px_100px_-50px_rgba(12,34,64,0.35)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <Badge className="w-fit rounded-full bg-[color:var(--brand-highlight)]/18 px-3 py-1 text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-highlight)]/18">
              {editMode ? "Agent settings" : "First login detected"}
            </Badge>
            <div>
              <h1 className="font-heading text-4xl text-slate-950">
                {editMode ? "Update your OpenClaw agent" : "Set up your OpenClaw News agent before entering the dashboard"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                {editMode
                  ? "Adjust the preferred topics, region, and pairing channel that drive your restored OpenClaw workspace."
                  : "Define how your agent should search, prioritize, and summarize news, then choose whether this user pairs through WhatsApp or Telegram."}
              </p>
            </div>
          </div>
          <SignOutButton />
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/70 bg-white/80">
            <CardContent className="flex gap-4 p-5">
              <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <p className="font-medium text-slate-950">Workspace ready</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {editMode
                    ? "Your desk is live. Update the profile below to refresh what the dashboard prioritizes."
                    : "Your desk is ready for agent configuration and dashboard setup."}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-white/70 bg-white/80">
            <CardContent className="flex gap-4 p-5">
              <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                <Bot className="size-5" />
              </div>
              <div>
                <p className="font-medium text-slate-950">Agent requirement</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {editMode
                    ? "Saved profile changes are reflected on the dashboard as soon as you return."
                    : "A saved OpenClaw profile is required before dashboard routing is unlocked."}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-white/70 bg-white/80">
            <CardContent className="flex gap-4 p-5">
              <div className="rounded-2xl bg-[color:var(--brand-ink)]/10 p-3 text-[color:var(--brand-ink)]">
                <Compass className="size-5" />
              </div>
              <div>
                <p className="font-medium text-slate-950">Personalized dashboard</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {editMode
                    ? "Preferred topics automatically reshape the priority lanes shown on the dashboard."
                    : "After setup, NewsClaw restores the user workspace snapshot and then runs the selected messaging pairing flow."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <OpenClawAgentForm
          userName={user.name}
          initialAgent={existingAgent ?? undefined}
          initialChannelConfig={channelConfig ?? undefined}
          mode={editMode ? "edit" : "create"}
        />
      </div>
    </main>
  );
}