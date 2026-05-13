import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const RUST_ANALYZER_STYLE_DESCRIPTION = /Rust Analyzer style/;

interface ExtensionPackage {
	activationEvents?: string[];
	contributes?: {
		commands?: Array<{ command: string; description?: string }>;
		languages?: Array<{ id: string }>;
		configuration?: {
			properties?: Record<
				string,
				{ default?: unknown; markdownDescription?: string }
			>;
		};
	};
}

function extensionPackage(): ExtensionPackage {
	const text = readFileSync(join(process.cwd(), "package.json"), "utf8");
	return JSON.parse(text) as ExtensionPackage;
}

test("uses contribution-generated activation for Musi documents", () => {
	const pkg = extensionPackage();
	const events = pkg.activationEvents ?? [];
	const languages = new Set(
		(pkg.contributes?.languages ?? []).map((language) => language.id),
	);

	assert.ok(languages.has("musi"));
	assert.ok(!events.includes("onLanguage:musi"));
	assert.ok(!events.includes("onLanguage:markdown"));
});

test("uses contribution-generated activation for Musi commands", () => {
	const pkg = extensionPackage();
	const events = pkg.activationEvents ?? [];
	const commandIds = new Set(
		(pkg.contributes?.commands ?? []).map((command) => command.command),
	);

	assert.ok(commandIds.has("musi.fmt"));
	assert.ok(!events.includes("onCommand:musi.fmt"));
});

test("contributes command center and inlay configuration", () => {
	const pkg = extensionPackage();
	const commandIds = new Set(
		(pkg.contributes?.commands ?? []).map((command) => command.command),
	);
	const properties = pkg.contributes?.configuration?.properties ?? {};

	assert.ok(commandIds.has("musi.showActions"));
	assert.ok(commandIds.has("musi.configureInlayHints"));
	assert.ok(commandIds.has("musi.showStatus"));
	assert.equal(
		properties["musi.inlayHints.parameterNames.enabled"]?.default,
		"literals",
	);
	assert.equal(
		properties["musi.inlayHints.variableTypes.enabled"]?.default,
		true,
	);
	assert.match(
		properties["musi.inlayHints.parameterNames.enabled"]?.markdownDescription ??
			"",
		RUST_ANALYZER_STYLE_DESCRIPTION,
	);
});
