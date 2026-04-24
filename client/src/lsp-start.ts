import type * as vscode from "vscode";

export function shouldAutoStartLspForDocument(
	document: vscode.TextDocument | undefined,
): boolean {
	return document?.uri.scheme === "file" && document.languageId === "musi";
}
