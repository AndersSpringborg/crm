import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Builds the sandbox template that the bash tool copies for each session.
 *
 * `eve start` does this in its own process before spawning the server and then
 * keeps that process alive, holding over 3 GB for the server's lifetime. eve
 * has no public prewarm for self-hosted builds, so the image runs eve's own
 * function once at build time and starts `.output/server/index.mjs` directly.
 * The template is a directory under `.eve/sandbox-cache`, reused while it exists.
 */
const eveRoot = join(
	dirname(fileURLToPath(import.meta.resolve("eve"))),
	"../..",
);
const prewarm = pathToFileURL(
	join(eveRoot, "dist/src/execution/sandbox/prewarm.js"),
).href;

const { prewarmBuiltAppSandboxes } = await import(prewarm);

await prewarmBuiltAppSandboxes({
	appRoot: join(import.meta.dirname, ".."),
	log: (line: string) => console.log(line),
});

process.exit(0);
