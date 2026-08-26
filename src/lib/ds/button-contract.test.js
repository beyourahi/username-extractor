import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./components/Button.svelte", import.meta.url), "utf8");

test("Button owns the complete shared presentation contract", () => {
	for (const value of [
		"primary",
		"secondary",
		"outline",
		"ghost",
		"destructive",
		"icon",
		"nav",
		"text-button leading-5",
		"gap-2",
		"h-9 px-3",
		"h-10 px-4",
		"h-11 px-5",
		"hover:no-underline",
		"focus:no-underline",
		"active:no-underline",
		"visited:no-underline"
	])
		assert.match(source, new RegExp(value));
});

test("Button keeps native and inert-link behavior", () => {
	assert.match(source, /type = "button"/);
	assert.match(source, /onclick\?\.\(event\)/);
	assert.match(source, /href=\{inactive \? undefined : href\}/);
	assert.match(source, /tabindex=\{inactive \? -1 : tabindex\}/);
	assert.match(source, /aria-busy=\{loading \|\| undefined\}/);
	assert.match(source, /disabled=\{inactive\}/);
	assert.match(source, /<button[\s\S]*\{onclick\}[\s\S]*class=/);
});
