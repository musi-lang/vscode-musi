const WHITESPACE = /\s/;

export const FALLBACK_COMPLETION_KEYWORDS = [
	"answer",
	"any",
	"ask",
	"as",
	"catch",
	"comptime",
	"data",
	"effect",
	"export",
	"given",
	"handle",
	"if",
	"import",
	"in",
	"known",
	"law",
	"let",
	"match",
	"mut",
	"native",
	"opaque",
	"partial",
	"pin",
	"quote",
	"rec",
	"require",
	"resume",
	"shape",
	"some",
	"unsafe",
	"where",
] as const;

export const FALLBACK_COMPLETION_SNIPPETS = [
	"let",
	"data",
	"shape",
	"given",
	"answer",
	"handle",
	"pin",
	"match",
	"native",
] as const;

export function shouldOfferFallbackCompletions(linePrefix: string): boolean {
	const previous = [...linePrefix].reverse().find((ch) => !WHITESPACE.test(ch));
	return previous !== ".";
}
