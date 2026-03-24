import { NextResponse } from "next/server";

import {
  getLatestRestoreJobByUserId,
  getMessagingPairingByUserId,
  getUserChannelConfigByUserId,
} from "@/lib/db";
import { spawnProvisioningWorker } from "@/lib/provisioning";
import { getCurrentUserFromRequest } from "@/lib/session";

export async function POST(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const restoreJob = getLatestRestoreJobByUserId(user.id);
  const channelConfig = getUserChannelConfigByUserId(user.id);

  if (!restoreJob || restoreJob.status !== "completed") {
    return NextResponse.json({ error: "Restore must complete before refreshing pairing." }, { status: 400 });
  }

  if (!channelConfig || channelConfig.preferredChannel !== "whatsapp") {
    return NextResponse.json({ error: "QR refresh is only available for WhatsApp pairing." }, { status: 400 });
  }

  spawnProvisioningWorker({
    mode: "whatsapp-refresh",
    restoreJobId: restoreJob.id,
    userId: user.id,
    instance: restoreJob.deployId ?? restoreJob.hostname ?? restoreJob.ipAddress ?? "",
    channel: "whatsapp",
    phoneNumber: channelConfig.whatsappPhoneNumber ?? "",
  });

  return NextResponse.json({ pairing: getMessagingPairingByUserId(user.id) });
}