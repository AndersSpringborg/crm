import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type Prisma } from "@crm/db";
import {
	DEFAULT_AGENT_MODEL,
	OPENROUTER_DEFAULT_AGENT_MODEL,
	readAgentModel,
	SETTINGS_ID,
	writeAgentModel,
} from "@crm/db/settings";
import { openRouterModel, selectedModel } from "../agent/lib/model";

async function clear() {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

/**
 * The row holds the Context key a rep typed and the model they chose, and
 * DATABASE_URL is somebody's working database. Deleting it and not putting it
 * back sends them through the research-key gate again with nothing saying why.
 */
let saved: Prisma.AppSettingUncheckedCreateInput | null = null;

beforeAll(async () => {
	saved = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });
});

beforeEach(clear);
afterEach(clear);

afterAll(async () => {
	if (saved) await db.appSetting.create({ data: saved });
});

describe("the configured model", () => {
	it("falls back when nothing has ever been chosen", async () => {
		const setting = await readAgentModel(db);

		expect(setting.id).toBe(DEFAULT_AGENT_MODEL.id);
		expect(setting.isDefault).toBe(true);

		expect(await selectedModel()).toBeNull();
	});

	it("returns the chosen model with its own context window", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});

		expect(await selectedModel()).toEqual({
			model: "anthropic/claude-sonnet-5",
			modelContextWindowTokens: 200_000,
		});
	});

	it("goes back to the fallback when the choice is cleared", async () => {
		await writeAgentModel(db, {
			id: "anthropic/claude-sonnet-5",
			contextWindowTokens: 200_000,
		});
		await writeAgentModel(db, null);

		expect(await selectedModel()).toBeNull();
		expect((await readAgentModel(db)).isDefault).toBe(true);
	});

	it("keeps one row rather than accumulating one per change", async () => {
		await writeAgentModel(db, { id: "openai/gpt-5.5", contextWindowTokens: 1 });
		await writeAgentModel(db, { id: "zai/glm-5.2", contextWindowTokens: 2 });

		expect(await db.appSetting.count()).toBe(1);
		expect((await readAgentModel(db)).id).toBe("zai/glm-5.2");
	});
});

describe("the model on OpenRouter", () => {
	const savedKey = process.env.OPENROUTER_API_KEY;

	beforeEach(() => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
	});

	afterEach(() => {
		if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
		else process.env.OPENROUTER_API_KEY = savedKey;
	});

	it("leaves the gateway in charge when there is no key", async () => {
		delete process.env.OPENROUTER_API_KEY;

		expect(await openRouterModel()).toBeNull();
	});

	it("runs the OpenRouter default when nothing has been chosen", async () => {
		const selection = await openRouterModel();

		expect(selection?.model.provider).toBe("openrouter.chat");
		expect(selection?.model.modelId).toBe(OPENROUTER_DEFAULT_AGENT_MODEL.id);
		expect(selection?.modelContextWindowTokens).toBe(
			OPENROUTER_DEFAULT_AGENT_MODEL.contextWindowTokens,
		);
	});

	it("runs the model chosen in settings", async () => {
		await writeAgentModel(db, {
			id: "deepseek/deepseek-v4.1-flash",
			contextWindowTokens: 1_048_576,
		});

		const selection = await openRouterModel();

		expect(selection?.model.modelId).toBe("deepseek/deepseek-v4.1-flash");
		expect(selection?.modelContextWindowTokens).toBe(1_048_576);
	});

	it("runs a model pinned elsewhere, such as a team agent's version", async () => {
		const selection = await openRouterModel({
			model: "qwen/qwen3.7-flash",
			modelContextWindowTokens: 1_000_000,
		});

		expect(selection?.model.modelId).toBe("qwen/qwen3.7-flash");
		expect(selection?.modelContextWindowTokens).toBe(1_000_000);
	});
});
