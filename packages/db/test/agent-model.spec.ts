import { afterEach, describe, expect, it } from "bun:test";
import {
	DEFAULT_AGENT_MODEL,
	defaultAgentModel,
	OPENROUTER_DEFAULT_AGENT_MODEL,
} from "../src/settings";

const saved = process.env.OPENROUTER_API_KEY;

afterEach(() => {
	if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
	else process.env.OPENROUTER_API_KEY = saved;
});

describe("the default agent model", () => {
	it("is the gateway default when there is no OpenRouter key", () => {
		delete process.env.OPENROUTER_API_KEY;

		expect(defaultAgentModel()).toEqual(DEFAULT_AGENT_MODEL);
	});

	it("is an OpenRouter id when an OpenRouter key is set", () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-test";

		expect(defaultAgentModel()).toEqual(OPENROUTER_DEFAULT_AGENT_MODEL);
	});

	it("ignores a key that is only whitespace", () => {
		process.env.OPENROUTER_API_KEY = "  ";

		expect(defaultAgentModel()).toEqual(DEFAULT_AGENT_MODEL);
	});
});
