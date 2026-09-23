import { openRouterApiKey } from "@crm/db/settings";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { z } from "zod";

const CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";

const OPENROUTER_CATALOG_URL = "https://openrouter.ai/api/v1/models";

const CATALOG_TTL_MS = 30 * 60_000;

const CATALOG_KEY = "settings:model-catalog";

const CATALOG_TIMEOUT_MS = 5_000;

export interface CatalogModel {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
}

const gatewayRate = z
	.union([z.number(), z.string()])
	.transform((value) => Number(value))
	.refine((value) => Number.isFinite(value))
	.nullable()
	.catch(null);

const gatewayModel = z.object({
	id: z.string(),
	name: z.string().catch(""),
	owned_by: z.string().catch(""),
	type: z.string().catch(""),
	tags: z.array(z.json()).catch([]),
	context_window: z.number(),
	pricing: z
		.object({ input: gatewayRate, output: gatewayRate })
		.nullable()
		.catch(null),
});

type GatewayModel = z.infer<typeof gatewayModel>;

const gatewayCatalog = z
	.object({ data: z.array(z.json()).catch([]) })
	.catch({ data: [] });

function usable(model: GatewayModel): boolean {
	return model.type === "language" && model.tags.includes("tool-use");
}

/** Both catalogs answer `{ data: [...] }`; each model is parsed on its own. */
type CatalogBody = z.infer<typeof gatewayCatalog>;

function gatewayModels(body: CatalogBody): CatalogModel[] {
	return body.data.flatMap((entry) => {
		const parsed = gatewayModel.safeParse(entry);
		return parsed.success && usable(parsed.data)
			? [toCatalogModel(parsed.data)]
			: [];
	});
}

const openRouterModel = z.object({
	id: z.string(),
	name: z.string().catch(""),
	context_length: z.number(),
	architecture: z
		.object({ output_modalities: z.array(z.string()).catch([]) })
		.catch({ output_modalities: [] }),
	pricing: z
		.object({ prompt: gatewayRate, completion: gatewayRate })
		.nullable()
		.catch(null),
	top_provider: z
		.object({ context_length: z.number().nullable().catch(null) })
		.nullable()
		.catch(null),
	supported_parameters: z.array(z.string()).catch([]),
});

/** OpenRouter's catalog, in the gateway's shape, so the picker stores OpenRouter ids. */
export function openRouterModels(body: CatalogBody): CatalogModel[] {
	return body.data.flatMap((entry) => {
		const parsed = openRouterModel.safeParse(entry);
		if (!parsed.success) return [];

		const model = parsed.data;
		const agentUsable =
			model.supported_parameters.includes("tools") &&
			model.architecture.output_modalities.includes("text");
		if (!agentUsable) return [];

		const input = model.pricing?.prompt ?? null;
		const output = model.pricing?.completion ?? null;

		return [
			{
				id: model.id,
				name: model.name || model.id,
				provider: model.id.split("/")[0] ?? model.id,
				contextWindowTokens:
					model.top_provider?.context_length ?? model.context_length,
				pricing: input !== null && output !== null ? { input, output } : null,
			},
		];
	});
}

function toCatalogModel(model: GatewayModel): CatalogModel {
	const input = model.pricing?.input ?? null;
	const output = model.pricing?.output ?? null;

	return {
		id: model.id,
		name: model.name || model.id,
		provider: model.owned_by || (model.id.split("/")[0] ?? model.id),
		contextWindowTokens: model.context_window,
		pricing: input !== null && output !== null ? { input, output } : null,
	};
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	async models(): Promise<CatalogModel[] | null> {
		const source = openRouterApiKey()
			? {
					key: `${CATALOG_KEY}:openrouter`,
					url: OPENROUTER_CATALOG_URL,
					parse: openRouterModels,
				}
			: { key: CATALOG_KEY, url: CATALOG_URL, parse: gatewayModels };

		const cached = await this.cache.get<CatalogModel[]>(source.key);
		if (cached) return cached;

		const models = await this.fetchCatalog(source.url, source.parse);
		if (!models) return null;

		await this.cache.set(source.key, models, CATALOG_TTL_MS);
		return models;
	}

	async find(id: string): Promise<CatalogModel | null> {
		const models = await this.models();
		return models?.find((model) => model.id === id) ?? null;
	}

	private async fetchCatalog(
		url: string,
		parse: (body: CatalogBody) => CatalogModel[],
	): Promise<CatalogModel[] | null> {
		try {
			const response = await fetch(url, {
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
			});

			if (!response.ok) {
				this.logger.warn({
					message: "Model catalog request failed",
					status: response.status,
				});
				return null;
			}

			const models = parse(gatewayCatalog.parse(await response.json()));

			models.sort(
				(a, b) =>
					a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
			);

			this.logger.log({
				message: "Model catalog loaded",
				models: models.length,
			});

			return models;
		} catch (error) {
			this.logger.warn({
				message: "Model catalog unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}
