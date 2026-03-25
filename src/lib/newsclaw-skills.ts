import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

import { NEWS_CATEGORIES, inferPriorityLaneKeys } from "@/lib/constants";

type NewsClawSkillInput = {
  agentName: string;
  trackingTopics: string[];
  region: string;
};

const CATEGORY_BY_KEY = new Map(NEWS_CATEGORIES.map((category) => [category.key, category]));

type GeneratedSkillFiles = {
  skillMd: string;
  categoriesMd: string;
};

export type NewsClawSkillBundle = {
  skillDirectory: string;
  zipFilePath: string;
};

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate newsclaw-skills content.");
  }

  return apiKey;
}

function getOpenAiModel() {
  return process.env.OPENAI_SKILL_MODEL?.trim() || "gpt-4.1-mini";
}

function getNewsClawSkillDirectory() {
  const configuredPath = process.env.NEWSCLAW_SKILL_DIR?.trim();

  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    configuredPath || "newsclaw-skills",
  );
}

function getNewsClawSkillZipPath(skillDirectory: string) {
  const parentDirectory = path.dirname(skillDirectory);
  const skillDirectoryName = path.basename(skillDirectory);

  return path.join(parentDirectory, `${skillDirectoryName}.zip`);
}

function quoteYamlValue(value: string) {
  return JSON.stringify(value);
}

function buildTopicQuery(topic: string, region: string, suffix: string) {
  return `- ${quoteYamlValue(`${topic} ${region} ${suffix} {MONTH} {YEAR}`.replace(/\s+/g, " ").trim())}`;
}

function renderSkillMarkdown(input: NewsClawSkillInput) {
  const activeCategories = inferPriorityLaneKeys(input.trackingTopics, input.region)
    .map((key) => CATEGORY_BY_KEY.get(key))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));

  const categoryList = activeCategories.length > 0
    ? activeCategories.map((category) => `- ${category.label} (${category.key})`).join("\n")
    : "- Technology (technology)";

  const topicList = input.trackingTopics.map((topic) => `- ${topic}`).join("\n");
  const defaultQueries = input.trackingTopics.slice(0, 5).map((topic) => buildTopicQuery(topic, input.region, "latest news")).join("\n");

  return `---
name: newsclaw
description: Use this skill when the user asks for a NewsClaw briefing tailored to the saved preferred topics and region focus.
metadata: { "newsclaw": { "agentName": ${quoteYamlValue(input.agentName)}, "region": ${quoteYamlValue(input.region)} } }
---

# NewsClaw - Personalized Briefing Agent

You are NewsClaw, the personalized news editor for ${input.agentName}.
Build briefings around the saved preferred topics, region focus, and dashboard lanes.

## Saved Focus

Region focus:
${input.region}

Preferred topics:
${topicList}

Active dashboard categories:
${categoryList}

## Behaviour Rules

1. Always fetch fresh reporting for current events. Do not rely on stale training knowledge for time-sensitive news.
2. Start from the saved preferred topics first, then widen to the active dashboard categories when the user asks for a broader digest.
3. Keep summaries concise and decision-oriented. Prefer primary or high-signal reporting.
4. Include the direct source URL for every story.
5. When the user asks for a default briefing, prioritize the active dashboard categories listed above.

## Search Query Templates

Use the following topic-first queries and adapt them to the current month and year:

${defaultQueries}

If the user asks for a broader digest, combine the topic-first queries with the active dashboard categories from categories.md.
`;
}

function renderCategoriesMarkdown(input: NewsClawSkillInput) {
  const activeCategories = inferPriorityLaneKeys(input.trackingTopics, input.region)
    .map((key) => CATEGORY_BY_KEY.get(key))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));

  const categorySections = activeCategories.length > 0
    ? activeCategories.map((category) => {
        const categoryQueries = [
          `- ${quoteYamlValue(`${category.label} news ${input.region} {MONTH} {YEAR}`)}`,
          ...input.trackingTopics.slice(0, 3).map((topic) => buildTopicQuery(topic, input.region, category.label)),
        ].join("\n");

        return `## ${category.label} (${category.key})

${category.description}

Suggested queries:
${categoryQueries}`;
      }).join("\n\n---\n\n")
    : `## Technology (technology)\n\n${CATEGORY_BY_KEY.get("technology")?.description ?? "Technology coverage."}`;

  const topicSections = input.trackingTopics.map((topic) => `- ${quoteYamlValue(topic)}`).join("\n");

  return `# NewsClaw - Generated Category Guide

This file is regenerated whenever preferred topics are saved from the NewsClaw setup flow.

Region focus:
${input.region}

Preferred topics:
${topicSections}

---

${categorySections}

---

## Topic-specific queries

${input.trackingTopics.map((topic) => [
  buildTopicQuery(topic, input.region, "breaking developments"),
  buildTopicQuery(topic, input.region, "analysis"),
].join("\n")).join("\n")}
`;
}

function buildOpenAiPrompt(input: NewsClawSkillInput) {
  const activeCategories = inferPriorityLaneKeys(input.trackingTopics, input.region)
    .map((key) => CATEGORY_BY_KEY.get(key))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));

  return {
    system: [
      "You generate Markdown files for an OpenClaw-related NewsClaw skill package.",
      "Return JSON only with two string fields: skillMd and categoriesMd.",
      "The content must be practical, concise, and tailored to the provided preferred topics and region.",
      "The SKILL.md output must be a valid skill file with YAML frontmatter followed by Markdown instructions.",
      "The categories.md output must be a Markdown reference file containing category guidance and search/query ideas.",
      "Both files should be mainly oriented toward OpenClaw news and monitoring use cases.",
      "Do not wrap Markdown content in code fences.",
    ].join(" "),
    user: JSON.stringify({
      agentName: input.agentName,
      region: input.region,
      trackingTopics: input.trackingTopics,
      inferredCategories: activeCategories.map((category) => ({
        key: category.key,
        label: category.label,
        description: category.description,
      })),
      availableCategories: NEWS_CATEGORIES,
      requirements: {
        skillMd: [
          "Mention OpenClaw explicitly.",
          "Tailor the skill to the saved preferred topics and region.",
          "Include behavior rules and search/query guidance.",
          "Keep the file production-ready for direct use.",
        ],
        categoriesMd: [
          "Summarize the inferred categories and how they relate to the preferred topics.",
          "Include targeted query ideas for each inferred category.",
          "Add a section for preferred-topic-specific search suggestions.",
        ],
      },
      examples: {
        skillMdStyle: renderSkillMarkdown(input),
        categoriesMdStyle: renderCategoriesMarkdown(input),
      },
    }),
  };
}

async function generateSkillFilesWithOpenAi(input: NewsClawSkillInput): Promise<GeneratedSkillFiles> {
  const prompt = buildOpenAiPrompt(input);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAiApiKey()}`,
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI skill generation failed: ${details || response.statusText}`);
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI skill generation returned an empty response.");
  }

  const parsed = JSON.parse(content) as Partial<GeneratedSkillFiles>;

  if (!parsed.skillMd?.trim() || !parsed.categoriesMd?.trim()) {
    throw new Error("OpenAI skill generation returned incomplete Markdown content.");
  }

  return {
    skillMd: parsed.skillMd.trim(),
    categoriesMd: parsed.categoriesMd.trim(),
  };
}

export async function writeNewsClawSkillFiles(input: NewsClawSkillInput) {
  const skillDirectory = getNewsClawSkillDirectory();
  const zipFilePath = getNewsClawSkillZipPath(skillDirectory);

  const generatedFiles = await generateSkillFilesWithOpenAi(input);

  await fs.mkdir(skillDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(skillDirectory, "SKILL.md"), `${generatedFiles.skillMd}\n`, "utf8"),
    fs.writeFile(path.join(skillDirectory, "categories.md"), `${generatedFiles.categoriesMd}\n`, "utf8"),
  ]);

  const zip = new JSZip();
  zip.file("SKILL.md", `${generatedFiles.skillMd}\n`);
  zip.file("categories.md", `${generatedFiles.categoriesMd}\n`);

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  await fs.writeFile(zipFilePath, zipBuffer);

  return {
    skillDirectory,
    zipFilePath,
  } satisfies NewsClawSkillBundle;
}