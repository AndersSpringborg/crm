import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { db } from "@crm/db";
import { openRouterApiKey, readAgentModel } from "@crm/db/settings";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface ModelSelection {
	model: string;
	modelContextWindowTokens: number;
}

export interface OpenRouterSelection {
	model: LanguageModelV4;
	modelContextWindowTokens: number;
}

export async function selectedModel(): Promise<ModelSelection | null> {
	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

/**
 * With OPENROUTER_API_KEY set, every model call goes to OpenRouter instead of
 * the Vercel AI Gateway. eve only takes a live model object from
 * `step.started`, so this is resolved per step and overrides the session's
 * gateway id. Without the key it returns null and the gateway path is untouched.
 */
export async function openRouterModel(
	pinned?: ModelSelection | null,
): Promise<OpenRouterSelection | null> {
	const apiKey = openRouterApiKey();

	if (!apiKey) return null;

	const choice = pinned ?? (await configuredModel());

	const openRouter = createOpenAICompatible({
		name: "openrouter",
		baseURL: OPENROUTER_BASE_URL,
		apiKey,
	});

	return {
		model: openRouter.chatModel(choice.model),
		modelContextWindowTokens: choice.modelContextWindowTokens,
	};
}

async function configuredModel(): Promise<ModelSelection> {
	const setting = await readAgentModel(db);

	return {
		model: setting.id,
		modelContextWindowTokens: setting.contextWindowTokens,
	};
}
