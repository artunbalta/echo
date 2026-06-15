/**
 * Loads environment before any other module reads process.env. npm workspaces run this
 * service with cwd = apps/realtime, so the repo-root .env isn't picked up by the default
 * `dotenv/config`. We load it explicitly (root first, then a local override if present).
 * Imported FIRST in index.ts so it runs before persistence/dialogue read their env consts.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../.env") }); // repo root
config({ path: resolve(here, "../.env"), override: true }); // optional local override
