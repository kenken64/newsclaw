import "server-only";

import {
  getLatestRestoreJobByUserId,
  getMessagingPairingByUserId,
  getOpenClawAgentByUserId,
  getUserChannelConfigByUserId,
} from "@/lib/db";

export function getPostAuthPath(userId: string) {
  const agent = getOpenClawAgentByUserId(userId);

  if (!agent) {
    return "/setup-agent";
  }

  const channelConfig = getUserChannelConfigByUserId(userId);

  if (!channelConfig) {
    return "/setup-agent?edit=1";
  }

  const restoreJob = getLatestRestoreJobByUserId(userId);

  if (!restoreJob || restoreJob.status !== "completed") {
    return "/restore-instance";
  }

  const pairing = getMessagingPairingByUserId(userId);

  if (!pairing || pairing.status !== "completed") {
    return "/pair-channel";
  }

  return "/dashboard";
}

export function hasCompletedRestore(userId: string) {
  const restoreJob = getLatestRestoreJobByUserId(userId);

  return restoreJob?.status === "completed";
}