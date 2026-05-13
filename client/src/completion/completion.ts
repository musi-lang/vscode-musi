/* biome-ignore-all lint/suspicious/noTemplateCurlyInString: VS Code snippets use `${n:name}` placeholders. */
import * as vscode from "vscode";
import {
	FALLBACK_COMPLETION_KEYWORDS,
	shouldOfferFallbackCompletions,
} from "./completion-core.ts";

const IDENTIFIER_WORD = /[A-Za-z_][A-Za-z0-9_]*/;

interface FallbackCompletion {
	readonly label: string;
	readonly kind: vscode.CompletionItemKind;
	readonly detail: string;
	readonly insertText?: vscode.SnippetString;
}

const SNIPPETS: readonly FallbackCompletion[] = [
	{
		label: "let",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "binding snippet",
		insertText: new vscode.SnippetString("let ${1:name} := ${0:value};"),
	},
	{
		label: "recur",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "recursive callable snippet",
		insertText: new vscode.SnippetString(
			"let recur ${1:name}(${2:value}: ${3:Type}) : ${4:Type} := ${0:body};",
		),
	},
	{
		label: "lambda",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "lambda expression snippet",
		insertText: new vscode.SnippetString(
			"\\(${1:value}: ${2:Type}) : ${3:Type} => ${0:value};",
		),
	},
	{
		label: "data",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "sum data snippet",
		insertText: new vscode.SnippetString(
			"let ${1:Name} := data {\n\t| ${2:Variant}(${3:value}: ${4:Type})\n};",
		),
	},
	{
		label: "dataproduct",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "product data snippet",
		insertText: new vscode.SnippetString(
			"let ${1:Name} := data {\n\tlet ${2:field}: ${3:Type};\n};",
		),
	},
	{
		label: "shape",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "shape declaration snippet",
		insertText: new vscode.SnippetString(
			"let ${1:Shape} := shape {\n\tlet ${2:member}(${3:value}: ${4:Type}) : ${5:Type};\n};",
		),
	},
	{
		label: "defer",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "defer expression snippet",
		insertText: new vscode.SnippetString(
			"defer ${1:cleanup} where ${0:condition};",
		),
	},
	{
		label: "yield",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "yield expression snippet",
		insertText: new vscode.SnippetString("yield ${0:value};"),
	},
	{
		label: "pin",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "pin action snippet",
		insertText: new vscode.SnippetString(
			"pin ${1:value} as ${2:pinned} in ${0:body};",
		),
	},
	{
		label: "match",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "match expression snippet",
		insertText: new vscode.SnippetString(
			"match ${1:value} (\n\t| ${2:pattern} => ${0:value}\n);",
		),
	},
	{
		label: "if",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "if expression snippet",
		insertText: new vscode.SnippetString(
			"if ${1:condition} then ${2:value} else ${0:fallback};",
		),
	},
	{
		label: "unsafe",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "unsafe block snippet",
		insertText: new vscode.SnippetString("unsafe {\n\t${0:expr;}\n};"),
	},
	{
		label: "export",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "exported binding snippet",
		insertText: new vscode.SnippetString("export let ${1:name} := ${0:value};"),
	},
	{
		label: "import",
		kind: vscode.CompletionItemKind.Snippet,
		detail: "import expression snippet",
		insertText: new vscode.SnippetString('import ${0:"@std"};'),
	},
];

function currentWordRange(
	document: vscode.TextDocument,
	position: vscode.Position,
): vscode.Range {
	return (
		document.getWordRangeAtPosition(position, IDENTIFIER_WORD) ??
		new vscode.Range(position, position)
	);
}

function shouldOfferFallbackCompletion(
	document: vscode.TextDocument,
	position: vscode.Position,
): boolean {
	if (document.languageId !== "musi" || document.uri.scheme !== "file") {
		return false;
	}
	return shouldOfferFallbackCompletions(
		document.lineAt(position.line).text.slice(0, position.character),
	);
}

export class FallbackCompletionProvider
	implements vscode.CompletionItemProvider
{
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] {
		if (!shouldOfferFallbackCompletion(document, position)) {
			return [];
		}
		const range = currentWordRange(document, position);
		const items = FALLBACK_COMPLETION_KEYWORDS.map((keyword) => {
			const item = new vscode.CompletionItem(
				keyword,
				vscode.CompletionItemKind.Keyword,
			);
			item.detail = "keyword";
			item.range = range;
			item.sortText = `2_${keyword}`;
			return item;
		});
		for (const snippet of SNIPPETS) {
			const item = new vscode.CompletionItem(snippet.label, snippet.kind);
			item.detail = snippet.detail;
			if (snippet.insertText) {
				item.insertText = snippet.insertText;
			}
			item.range = range;
			item.sortText = `1_${snippet.label}`;
			items.push(item);
		}
		return items;
	}
}

export class CompletionController implements vscode.Disposable {
	#context: vscode.ExtensionContext;
	#fallback: vscode.Disposable | undefined;

	constructor(context: vscode.ExtensionContext) {
		this.#context = context;
	}

	setLspRunning(isRunning: boolean) {
		if (isRunning) {
			this.#fallback?.dispose();
			this.#fallback = undefined;
			return;
		}
		if (this.#fallback) {
			return;
		}
		this.#fallback = vscode.languages.registerCompletionItemProvider(
			{ scheme: "file", language: "musi" },
			new FallbackCompletionProvider(),
			".",
		);
		this.#context.subscriptions.push(this.#fallback);
	}

	dispose() {
		this.#fallback?.dispose();
	}
}
