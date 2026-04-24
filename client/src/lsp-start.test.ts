import assert from "node:assert/strict";
import test from "node:test";

import { shouldAutoStartLspForDocument } from "./lsp-start.ts";

function document(languageId: string, scheme = "file") {
	return {
		languageId,
		uri: { scheme },
	} as Parameters<typeof shouldAutoStartLspForDocument>[0];
}

test("auto-starts LSP for Musi file documents", () => {
	assert.equal(shouldAutoStartLspForDocument(document("musi")), true);
});

test("does not auto-start LSP for Markdown documents", () => {
	assert.equal(shouldAutoStartLspForDocument(document("markdown")), false);
});

test("does not auto-start LSP for non-file Musi documents", () => {
	assert.equal(
		shouldAutoStartLspForDocument(document("musi", "untitled")),
		false,
	);
});
