import { redirect } from "next/navigation";

import { RestoreInstanceClient } from "@/components/restore-instance-client";
import { Badge } from "@/components/ui/badge";
import { getMessagingPairingsByUserId, getOpenClawAgentByUserId, getUserChannelConfigByUserId } from "@/lib/db";
import { getLatestRestoreJobByUserId } from "@/lib/db";
import { getProvisioningReadiness, serializeRestoreJob } from "@/lib/provisioning";
import { requireUser } from "@/lib/session";

export default async function RestoreInstancePage() {
  const user = await requireUser();
  const agent = getOpenClawAgentByUserId(user.id);

  if (!agent) {
    redirect("/setup-agent");
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);
  const pairings = getMessagingPairingsByUserId(user.id);
  const channelConfig = getUserChannelConfigByUserId(user.id);
  if (restoreJob?.status === "completed") {
    if (!channelConfig || !pairings.some(p => p.status === "completed")) {
      redirect("/pair-channel");
    }

    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,212,113,0.2),transparent_32%),linear-gradient(180deg,#eef4f8_0%,#e8eef4_100%)] px-6 py-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8">
        <header className="space-y-4 rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-[0_30px_100px_-50px_rgba(12,34,64,0.35)] backdrop-blur-xl">
          <Badge className="w-fit rounded-full bg-[color:var(--brand-highlight)]/18 px-3 py-1 text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-highlight)]/18">
            Snapshot restore
          </Badge>
          <div>
            <h1 className="font-heading text-4xl text-slate-950">Restore the OpenClaw workspace snapshot</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">This stage provisions the instance from the pinned snapshot and records the deployment details NewsClaw needs for the channel challenge.</p>
          </div>
        </header>

        <RestoreInstanceClient
          initialRestoreJob={serializeRestoreJob(restoreJob)}
          missingConfig={getProvisioningReadiness()}
          userEmail={user.email}
        />
      </div>
    </main>
  );
}