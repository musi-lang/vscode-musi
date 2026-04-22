import { test } from "bun:test";
import { strict as assert } from "node:assert/strict";
import {
	FALLBACK_COMPLETION_KEYWORDS,
	FALLBACK_COMPLETION_SNIPPETS,
	shouldOfferFallbackCompletions,
} from "./completion-core.ts";

test("fallback completions expose current Musi keywords", () => {
	assert.ok(FALLBACK_COMPLETION_KEYWORDS.includes("shape"));
	assert.ok(FALLBACK_COMPLETION_KEYWORDS.includes("given"));
	assert.ok(FALLBACK_COMPLETION_KEYWORDS.includes("ask"));
	assert.ok(FALLBACK_COMPLETION_KEYWORDS.includes("pin"));
	assert.ok(!FALLBACK_COMPLETION_KEYWORDS.includes("class" as never));
	assert.ok(!FALLBACK_COMPLETION_KEYWORDS.includes("instance" as never));
});

test("fallback completions expose high-value snippets", () => {
	assert.deepEqual(
		[...FALLBACK_COMPLETION_SNIPPETS],
		[
			"let",
			"data",
			"shape",
			"given",
			"answer",
			"handle",
			"pin",
			"match",
			"native",
		],
	);
});

test("fallback completions defer member access to LSP", () => {
	assert.equal(shouldOfferFallbackCompletions("point."), false);
	assert.equal(shouldOfferFallbackCompletions("point.  "), false);
	assert.equal(shouldOfferFallbackCompletions("let value := "), true);
});
