import * as vscode from "vscode";
import { findCliPath } from "./bootstrap.ts";
import { MsPackageCodeLensProvider } from "./codelens.ts";
import { clearCliCache, registerCommands } from "./commands.ts";
import { CompletionController } from "./completion/completion.ts";
import { onConfigChange } from "./config.ts";
import { DiagnosticsController } from "./diagnostics.ts";
import { FormatterController } from "./formatter/formatter.ts";
import { LspController } from "./lsp.ts";
import { shouldAutoStartLspForDocument } from "./lsp-start.ts";
import { StatusBar } from "./status.ts";

let statusBar: StatusBar | undefined;
let diagnostics: DiagnosticsController | undefined;
let lsp: LspController | undefined;
let formatter: FormatterController | undefined;
let completions: CompletionController | undefined;

function reportBackgroundError(action: string, error: unknown) {
	console.error(`[musi-vscode] ${action}:`, error);
}

async function refreshCliAndStatus() {
	if (!(statusBar && diagnostics)) {
		return;
	}
	if (!(lsp?.isRunning() || findCliPath())) {
		statusBar.update("CLI missing", "error");
		return;
	}
	await diagnostics.refreshStatusForActiveEditor();
}

async function startLspForDocument(
	context: vscode.ExtensionContext,
	document: vscode.TextDocument | undefined,
) {
	if (!(lsp && shouldAutoStartLspForDocument(document)) || lsp.isRunning()) {
		return;
	}
	await lsp.start(context);
}

function registerEditorListeners(context: vscode.ExtensionContext) {
	if (!diagnostics) {
		return;
	}

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			diagnostics?.scheduleDocumentCheck(document);
		}),
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			(async () => {
				await startLspForDocument(context, editor?.document);
				await refreshCliAndStatus();
			})().catch((error) => {
				reportBackgroundError("refresh status", error);
			});
		}),
	);
}

function setupConfigChangeHandler(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		onConfigChange(() => {
			clearCliCache();
			(async () => {
				if (lsp?.isRunning()) {
					await lsp.restart(context);
				} else {
					await startLspForDocument(
						context,
						vscode.window.activeTextEditor?.document,
					);
				}
				await refreshCliAndStatus();
			})().catch((error) => {
				reportBackgroundError("reload configuration", error);
			});
		}),
	);
}

export async function activate(context: vscode.ExtensionContext) {
	statusBar = new StatusBar();
	diagnostics = new DiagnosticsController(statusBar);
	formatter = new FormatterController(context);
	completions = new CompletionController(context);
	lsp = new LspController(statusBar, diagnostics, (isRunning) => {
		formatter?.setLspRunning(isRunning);
		completions?.setLspRunning(isRunning);
	});

	context.subscriptions.push(
		statusBar,
		diagnostics,
		formatter,
		completions,
		lsp,
		vscode.languages.registerCodeLensProvider(
			{ scheme: "file", pattern: "**/musi.json" },
			new MsPackageCodeLensProvider() as unknown as vscode.CodeLensProvider,
		),
	);

	registerCommands(context, diagnostics, lsp);
	registerEditorListeners(context);
	setupConfigChangeHandler(context);

	await startLspForDocument(context, vscode.window.activeTextEditor?.document);
	formatter.setLspRunning(lsp.isRunning());
	completions.setLspRunning(lsp.isRunning());
	await refreshCliAndStatus();
}

export async function deactivate() {
	await lsp?.stop();
	diagnostics?.dispose();
	formatter?.dispose();
	completions?.dispose();
	statusBar?.dispose();
}
