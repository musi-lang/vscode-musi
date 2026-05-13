const WHITESPACE = /\s/;

export const FALLBACK_COMPLETION_KEYWORDS = [
	"and",
	"as",
	"data",
	"defer",
	"else",
	"erased",
	"export",
	"hidden",
	"if",
	"import",
	"in",
	"known",
	"let",
	"match",
	"mut",
	"not",
	"or",
	"pin",
	"recur",
	"shape",
	"then",
	"unsafe",
	"where",
	"xor",
	"yield",
] as const;

export const FALLBACK_COMPLETION_SNIPPETS = [
	"let",
	"recur",
	"lambda",
	"data",
	"dataproduct",
	"shape",
	"defer",
	"yield",
	"pin",
	"match",
	"if",
	"unsafe",
	"export",
	"import",
] as const;

export function shouldOfferFallbackCompletions(linePrefix: string): boolean {
	const previous = [...linePrefix].reverse().find((ch) => !WHITESPACE.test(ch));
	return previous !== ".";
}
