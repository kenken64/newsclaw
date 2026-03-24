import { NextResponse } from "next/server";
import { z } from "zod";

import { NEWS_CATEGORIES } from "@/lib/constants";
import { replaceCategoryPreferences } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/session";

const categoryKeys = NEWS_CATEGORIES.map((category) => category.key);

const requestSchema = z.object({
  categories: z.array(z.enum(categoryKeys as [string, ...string[]])).max(8),
});

export async function PUT(request: Request) {
  const user = getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    replaceCategoryPreferences(user.id, Array.from(new Set(body.categories)));

    return NextResponse.json({ success: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to update categories.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}