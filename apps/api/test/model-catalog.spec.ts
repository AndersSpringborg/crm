import { describe, expect, it } from "bun:test";
import { openRouterModels } from "../src/settings/model-catalog.service";

const glmFlash = {
	id: "z-ai/glm-5.3-flash",
	canonical_slug: "z-ai/glm-5.3-flash-20260826",
	name: "Z.ai: GLM 5.3 Flash",
	context_length: 1_310_720,
	architecture: {
		modality: "text+image+video->text",
		input_modalities: ["text", "image", "video"],
		output_modalities: ["text"],
	},
	pricing: {
		prompt: "0.00000015",
		completion: "0.0000005",
		input_cache_read: "0.00000005",
	},
	top_provider: {
		context_length: 1_048_576,
		max_completion_tokens: 943_718,
		is_moderated: false,
	},
	supported_parameters: ["max_tokens", "reasoning", "tool_choice", "tools"],
};

const noTools = {
	id: "qwen/qwen3.8-omni-flash",
	name: "Qwen: Qwen3.8 Omni Flash",
	context_length: 1_000_000,
	architecture: { output_modalities: ["text"] },
	pricing: { prompt: "0.00000015", completion: "0.00000047" },
	top_provider: { context_length: 1_000_000 },
	supported_parameters: ["max_tokens", "temperature"],
};

const imageOut = {
	...glmFlash,
	id: "google/image-model",
	name: "Google: Image Model",
	architecture: { output_modalities: ["image"] },
};

describe("the OpenRouter model catalog", () => {
	it("lists a tool-calling text model with its served window and per-token prices", () => {
		expect(openRouterModels({ data: [glmFlash] })).toEqual([
			{
				id: "z-ai/glm-5.3-flash",
				name: "Z.ai: GLM 5.3 Flash",
				provider: "z-ai",
				contextWindowTokens: 1_048_576,
				pricing: { input: 0.00000015, output: 0.0000005 },
			},
		]);
	});

	it("leaves out models the agent cannot use", () => {
		expect(openRouterModels({ data: [noTools, imageOut] })).toEqual([]);
	});

	it("falls back to the model's own window when no provider reports one", () => {
		const { top_provider: _, ...bare } = glmFlash;

		expect(openRouterModels({ data: [bare] })[0]?.contextWindowTokens).toBe(
			1_310_720,
		);
	});

	it("skips entries it cannot read", () => {
		expect(openRouterModels({ data: [{ id: 1 }, "<html>"] })).toEqual([]);
	});
});
