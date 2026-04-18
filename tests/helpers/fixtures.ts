import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures", "ksef");

export function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}
