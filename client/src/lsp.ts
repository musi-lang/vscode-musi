import * as vscode from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	State,
	TransportKind,
} from "vscode-languageclient/node";
import {
	findLspBinary,
	showLspNotFoundUI,
	showStaleLspBinaryUI,
} from "./bootstrap.ts";
import { getConfig } from "./config.ts";
import type { DiagnosticsController } from "./diagnostics.ts";
import type { StatusBar } from "./status.ts";

type LspStateListener = (isRunning: boolean) => void;

function ignoreLspState(_isRunning: boolean) {
	return;
}

export class LspController implements vscode.Disposable {
	#client: LanguageClient | undefined;
	#session = 0;
	#statusBar: StatusBar;
	#diagnostics: DiagnosticsController;
	#onStateChange: LspStateListener;

	constructor(
		statusBar: StatusBar,
		diagnostics: DiagnosticsController,
		onStateChange: LspStateListener = ignoreLspState,
	) {
		this.#statusBar = statusBar;
		this.#diagnostics = diagnostics;
		this.#onStateChange = onStateChange;
	}

	isRunning(): boolean {
		return this.#client?.state === State.Running;
	}

	showOutput(): void {
		this.#client?.outputChannel.show();
	}

	#isCurrentSession(session: number, client: LanguageClient): boolean {
		return this.#session === session && this.#client === client;
	}

	#setRunning() {
		this.#diagnostics.setMode("manifest-only");
		this.#statusBar.update("LSP ready", "ready");
		this.#onStateChange(true);
	}

	#setStopped(message: string, state: "error" | "stopped" = "error") {
		this.#diagnostics.setMode("full");
		this.#statusBar.update(message, state);
		this.#onStateChange(false);
	}

	async start(context: vscode.ExtensionContext): Promise<boolean> {
		const session = ++this.#session;
		const config = getConfig();
		if (!config.lspEnabled) {
			this.#client = undefined;
			this.#setStopped("LSP disabled", "stopped");
			return false;
		}
		const server = findLspBinary();
		const serverPath = server.path;
		if (!serverPath) {
			this.#client = undefined;
			this.#setStopped(
				server.staleWorkspacePath ? "LSP stale" : "LSP unavailable",
			);
			if (server.staleWorkspacePath) {
				await showStaleLspBinaryUI(
					server.staleWorkspacePath,
					server.freshnessPath,
				);
			} else {
				await showLspNotFoundUI();
			}
			return false;
		}

		const serverOptions: ServerOptions = {
			command: serverPath,
			args: [],
			transport: TransportKind.stdio,
		};
		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: "file", language: "musi" }],
			outputChannelName: "Musi LSP",
			initializationOptions: {
				hover: {
					maximumLength: config.hoverMaximumLength,
				},
				inlayHints: {
					enabled: config.inlayHints.enabled,
					parameterNames: config.inlayHints.parameterNames,
					parameterNamesSuppressWhenArgumentMatchesName:
						config.inlayHints.parameterNamesSuppressWhenArgumentMatchesName,
					variableTypes: config.inlayHints.variableTypes,
					variableTypesSuppressWhenTypeMatchesName:
						config.inlayHints.variableTypesSuppressWhenTypeMatchesName,
				},
			},
		};
		const client = new LanguageClient(
			"musi-lsp",
			"Musi LSP",
			serverOptions,
			clientOptions,
		);
		this.#client = client;
		client.onDidChangeState((event) => {
			if (!this.#isCurrentSession(session, client)) {
				return;
			}
			if (event.newState === State.Running) {
				this.#setRunning();
				return;
			}
			if (event.newState === State.Stopped) {
				this.#client = undefined;
				this.#setStopped("LSP unavailable");
			}
		});

		try {
			context.subscriptions.push(client);
			await client.start();
			if (!this.#isCurrentSession(session, client)) {
				await client.stop();
				return false;
			}
			this.#setRunning();
			return true;
		} catch (error) {
			if (!this.#isCurrentSession(session, client)) {
				return false;
			}
			this.#client = undefined;
			this.#setStopped("LSP unavailable");
			vscode.window
				.showErrorMessage(`Failed to start Musi LSP: ${String(error)}`)
				.then(undefined, (messageError: unknown) => {
					console.error(
						"[musi-vscode] failed to show LSP error message:",
						messageError,
					);
				});
			return false;
		}
	}

	async restart(context: vscode.ExtensionContext): Promise<boolean> {
		const previous = this.#client;
		this.#client = undefined;
		this.#session += 1;
		if (previous) {
			await previous.stop();
		}
		return this.start(context);
	}

	async stop(): Promise<void> {
		const client = this.#client;
		this.#client = undefined;
		this.#session += 1;
		this.#setStopped("LSP stopped", "stopped");
		if (client) {
			await client.stop();
		}
	}

	dispose() {
		this.stop().catch((error) => {
			console.error("[musi-vscode] failed to stop LSP client:", error);
		});
	}
}
