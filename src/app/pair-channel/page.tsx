import { redirect } from "next/navigation";

import { MessagingPairingPanel } from "@/components/messaging-pairing-panel";
import { Badge } from "@/components/ui/badge";
import {
  getLatestRestoreJobByUserId,
  getMessagingPairingByUserId,
  getOpenClawAgentByUserId,
  getUserChannelConfigByUserId,
} from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function PairChannelPage() {
  const user = await requireUser();
  const agent = getOpenClawAgentByUserId(user.id);

  if (!agent) {
    redirect("/setup-agent");
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);

  if (!restoreJob || restoreJob.status !== "completed") {
    redirect("/restore-instance");
  }

  const channelConfig = getUserChannelConfigByUserId(user.id);

  if (!channelConfig) {
    redirect("/setup-agent?edit=1");
  }

  const pairing = getMessagingPairingByUserId(user.id);

  if (pairing?.status === "completed") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,212,113,0.2),transparent_32%),linear-gradient(180deg,#eef4f8_0%,#e8eef4_100%)] px-6 py-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8">
        <header className="space-y-4 rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-[0_30px_100px_-50px_rgba(12,34,64,0.35)] backdrop-blur-xl">
          <Badge className="w-fit rounded-full bg-[color:var(--brand-highlight)]/18 px-3 py-1 text-[color:var(--brand-ink)] hover:bg-[color:var(--brand-highlight)]/18">
            Channel pairing
          </Badge>
          <div>
            <h1 className="font-heading text-4xl text-slate-950">Connect the user messaging channel</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">This user selected {channelConfig.preferredChannel === "whatsapp" ? "WhatsApp" : "Telegram"} during setup. Finish the channel challenge before NewsClaw opens the dashboard.</p>
          </div>
        </header>

        <MessagingPairingPanel
          preferredChannel={channelConfig.preferredChannel}
          userEmail={user.email}
          initialPairing={pairing ? {
            channel: pairing.channel,
            status: pairing.status,
            qrOutput: pairing.qrOutput,
            instructionText: pairing.instructionText,
            pairingCode: pairing.pairingCode,
            errorMessage: pairing.errorMessage,
          } : null}
        />
      </div>
    </main>
  );
}