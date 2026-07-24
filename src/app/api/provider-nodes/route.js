import { NextResponse } from "next/server";
import { createProviderNode, getProviderNodes } from "@/models";
import { z } from "zod";
import { withBodyValidation } from "@/lib/api/withValidation";
import { safeUrlSchema } from "@/shared/validators/zodSchemas";
import { OPENAI_COMPATIBLE_PREFIX, ANTHROPIC_COMPATIBLE_PREFIX, CUSTOM_EMBEDDING_PREFIX } from "@/shared/constants/providers";
import { generateId } from "@/shared/utils";

export const dynamic = "force-dynamic";

const ProviderNodeSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  prefix: z.string().min(1, "Prefix is required").trim(),
  type: z.enum(["openai-compatible", "custom-embedding", "anthropic-compatible"]).optional().default("openai-compatible"),
  apiType: z.enum(["chat", "responses"]).optional(),
  baseUrl: z.union([safeUrlSchema, z.literal(""), z.string().trim().length(0)]).optional(),
}).superRefine((data, ctx) => {
  if (data.type === "openai-compatible" && (!data.apiType || !["chat", "responses"].includes(data.apiType))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid OpenAI compatible API type",
      path: ["apiType"]
    });
  }
});


const OPENAI_COMPATIBLE_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
};

const ANTHROPIC_COMPATIBLE_DEFAULTS = {
  baseUrl: "https://api.anthropic.com/v1",
};

const CUSTOM_EMBEDDING_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
};

// GET /api/provider-nodes - List all provider nodes
export async function GET() {
  try {
    const nodes = await getProviderNodes();
    return NextResponse.json({ nodes });
  } catch (error) {
    console.log("Error fetching provider nodes:", error);
    return NextResponse.json({ error: "Failed to fetch provider nodes" }, { status: 500 });
  }
}

// POST /api/provider-nodes - Create provider node
export const POST = withBodyValidation(ProviderNodeSchema, async (request, body) => {
  try {
    const { name, prefix, apiType, baseUrl, type } = body;
    const nodeType = type;

    if (nodeType === "openai-compatible") {
      const node = await createProviderNode({
        id: `${OPENAI_COMPATIBLE_PREFIX}${apiType}-${generateId()}`,
        type: "openai-compatible",
        prefix,
        apiType,
        baseUrl: (baseUrl || OPENAI_COMPATIBLE_DEFAULTS.baseUrl).trim(),
        name,
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "custom-embedding") {
      let sanitizedBaseUrl = (baseUrl || CUSTOM_EMBEDDING_DEFAULTS.baseUrl).trim().replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/embeddings")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -"/embeddings".length);
      }

      const node = await createProviderNode({
        id: `${CUSTOM_EMBEDDING_PREFIX}${generateId()}`,
        type: "custom-embedding",
        prefix,
        baseUrl: sanitizedBaseUrl,
        name,
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "anthropic-compatible") {
      let sanitizedBaseUrl = (baseUrl || ANTHROPIC_COMPATIBLE_DEFAULTS.baseUrl).trim().replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/messages")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -9);
      }

      const node = await createProviderNode({
        id: `${ANTHROPIC_COMPATIBLE_PREFIX}${generateId()}`,
        type: "anthropic-compatible",
        prefix,
        baseUrl: sanitizedBaseUrl,
        name,
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid provider node type" }, { status: 400 });
  } catch (error) {
    console.log("Error creating provider node:", error);
    return NextResponse.json({ error: "Failed to create provider node" }, { status: 500 });
  }
});
