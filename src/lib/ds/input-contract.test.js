import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./components/styles.ts", import.meta.url), "utf8");

test("inputBase owns one stable two-pixel field-edge focus indicator", () => {
	for (const value of [
		"border-2",
		"border-transparent",
		"focus:border-ring",
		"focus:outline-none",
		"focus:surface-hover",
		"aria-invalid:border-destructive",
		"disabled:opacity-50"
	])
		assert.match(source, new RegExp(value));
	assert.doesNotMatch(source, /\bw-full border border-transparent\b/);
});
