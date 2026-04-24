import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

interface ExtensionPackage {
	activationEvents?: string[];
}

function extensionPackage(): ExtensionPackage {
	const text = readFileSync(join(process.cwd(), "package.json"), "utf8");
	return JSON.parse(text) as ExtensionPackage;
}

test("activates LSP path for Musi documents, not Markdown documents", () => {
	const events = extensionPackage().activationEvents ?? [];

	assert.ok(events.includes("onLanguage:musi"));
	assert.ok(!events.includes("onLanguage:markdown"));
});

test("keeps explicit Markdown formatting command activatable", () => {
	const events = extensionPackage().activationEvents ?? [];

	assert.ok(events.includes("onCommand:musi.fmt"));
});
