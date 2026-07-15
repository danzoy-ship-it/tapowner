// Sync data/improvement_crosswalk.json (the master, shared with the data
// pipeline) into api/src/lib/crosswalkData.ts so the crosswalk ships inside the
// api deploy image (Railway's build context is api/ only -- ../data never
// ships). Run after ANY crosswalk edit:  npm run sync:crosswalk
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const master = path.resolve(here, "../../data/improvement_crosswalk.json");
const out = path.resolve(here, "../src/lib/crosswalkData.ts");

const json = JSON.parse(readFileSync(master, "utf8"));
const banner =
    "// GENERATED FILE -- do not edit by hand.\n" +
    "// Master: data/improvement_crosswalk.json (app session owns it).\n" +
    "// Regenerate after any crosswalk edit:  cd api && npm run sync:crosswalk\n";
writeFileSync(out, `${banner}export const CROSSWALK = ${JSON.stringify(json, null, 2)} as const;\n`);
console.log(`synced crosswalk v${json.version} (${json.updated}) -> src/lib/crosswalkData.ts`);
