"use client";

import { startTransition, useState } from "react";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);

    await fetch("/api/auth/logout", {
      method: "POST",
    });

    startTransition(() => {
      router.push("/");
      router.refresh();
    });

    setBusy(false);
  }

  return (
    <Button
      variant="outline"
      className="h-10 rounded-full border-white/15 bg-white/10 px-4 text-white hover:bg-white/20 hover:text-white"
      onClick={handleSignOut}
      disabled={busy}
    >
      {busy ? <LoaderCircle className="animate-spin" /> : <LogOut />}
      Sign out
    </Button>
  );
}