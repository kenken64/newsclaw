import "server-only";

import {
  getLatestRestoreJobByUserId,
  getMessagingPairingsByUserId,
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

  const pairings = getMessagingPairingsByUserId(userId);

  if (!pairings.some(p => p.status === "completed")) {
    return "/pair-channel";
  }

  return "/dashboard";
}

export function hasCompletedRestore(userId: string) {
  const restoreJob = getLatestRestoreJobByUserId(userId);

  return restoreJob?.status === "completed";
}