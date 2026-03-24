export const SESSION_MAX_AGE_DAYS = 30;

export const NEWS_CATEGORIES = [
  {
    key: "world",
    label: "World Affairs",
    description: "Geopolitics, diplomacy, conflicts, and international policy.",
  },
  {
    key: "business",
    label: "Business",
    description: "Markets, executive shifts, company strategy, and earnings moves.",
  },
  {
    key: "technology",
    label: "Technology",
    description: "AI, product launches, developer ecosystems, and platform changes.",
  },
  {
    key: "policy",
    label: "Policy",
    description: "Regulation, legislation, public sector decisions, and compliance.",
  },
  {
    key: "climate",
    label: "Climate",
    description: "Energy transition, weather risk, sustainability, and science updates.",
  },
  {
    key: "security",
    label: "Security",
    description: "Cybersecurity incidents, resilience, and critical infrastructure alerts.",
  },
  {
    key: "media",
    label: "Media",
    description: "Publishing trends, creator economy, streaming, and platform distribution.",
  },
  {
    key: "sports",
    label: "Sports",
    description: "Major league developments, global competitions, and standout performances.",
  },
] as const;

export type NewsCategoryKey = (typeof NEWS_CATEGORIES)[number]["key"];

const TOPIC_CATEGORY_KEYWORDS: Record<NewsCategoryKey, string[]> = {
  world: [
    "asean",
    "asia",
    "border",
    "diplom",
    "election",
    "europe",
    "geopolit",
    "global",
    "international",
    "middle east",
    "south china sea",
    "trade war",
    "war",
  ],
  business: [
    "acquisition",
    "earnings",
    "finance",
    "funding",
    "ipo",
    "m&a",
    "market",
    "merger",
    "pricing",
    "profit",
    "revenue",
    "startup",
    "valuation",
    "venture",
  ],
  technology: [
    "ai",
    "app",
    "automation",
    "chip",
    "cloud",
    "developer",
    "digital",
    "llm",
    "model",
    "platform",
    "product",
    "robot",
    "saas",
    "semiconductor",
    "software",
  ],
  policy: [
    "antitrust",
    "bill",
    "compliance",
    "court",
    "government",
    "law",
    "legislation",
    "policy",
    "public sector",
    "regulation",
    "sanction",
    "standards",
  ],
  climate: [
    "battery",
    "carbon",
    "climate",
    "emission",
    "energy",
    "ev",
    "flood",
    "grid",
    "renewable",
    "solar",
    "storm",
    "sustainability",
    "weather",
  ],
  security: [
    "breach",
    "cyber",
    "fraud",
    "hack",
    "identity",
    "malware",
    "phishing",
    "ransomware",
    "resilience",
    "risk",
    "security",
    "surveillance",
    "threat",
    "vulnerability",
  ],
  media: [
    "advertising",
    "broadcast",
    "content",
    "creator",
    "media",
    "newsroom",
    "podcast",
    "publisher",
    "social",
    "streaming",
  ],
  sports: [
    "athlete",
    "championship",
    "club",
    "esports",
    "fifa",
    "league",
    "match",
    "olympic",
    "sport",
    "tournament",
  ],
};

const CATEGORY_ORDER = NEWS_CATEGORIES.map((category) => category.key);

function addScore(scores: Map<NewsCategoryKey, number>, categoryKey: NewsCategoryKey, amount = 1) {
  scores.set(categoryKey, (scores.get(categoryKey) ?? 0) + amount);
}

export function inferPriorityLaneKeys(
  trackingTopics: string[],
  region?: string,
): NewsCategoryKey[] {
  const scores = new Map<NewsCategoryKey, number>();

  for (const topic of trackingTopics) {
    const normalizedTopic = topic.toLowerCase();

    for (const categoryKey of CATEGORY_ORDER) {
      const keywords = TOPIC_CATEGORY_KEYWORDS[categoryKey];

      if (keywords.some((keyword) => normalizedTopic.includes(keyword))) {
        addScore(scores, categoryKey);
      }
    }
  }

  if (region) {
    const normalizedRegion = region.toLowerCase();

    if (normalizedRegion.includes("asia") || normalizedRegion.includes("southeast asia")) {
      addScore(scores, "world", 2);
    }

    if (normalizedRegion.includes("government") || normalizedRegion.includes("capital")) {
      addScore(scores, "policy");
    }
  }

  if (trackingTopics.length > 0) {
    addScore(scores, "technology");
  }

  return CATEGORY_ORDER
    .filter((categoryKey) => scores.has(categoryKey))
    .sort((left, right) => {
      const scoreDifference = (scores.get(right) ?? 0) - (scores.get(left) ?? 0);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return CATEGORY_ORDER.indexOf(left) - CATEGORY_ORDER.indexOf(right);
    })
    .slice(0, 4);
}

export const DEFAULT_PASSKEY_NAME = "Primary device";