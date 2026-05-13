import * as vscode from "vscode";
import { getConfig } from "./config.ts";
import type { DiagnosticsController } from "./diagnostics.ts";
import { formatActiveDocumentWithCli } from "./formatter/formatter.ts";
import type { LspController } from "./lsp.ts";
import {
	activeDocumentUri,
	findOwningManifestPathForUri,
	findWorkspaceManifestPathForUri,
	loadPackageRoot,
	taskPlan,
	taskSpecs,
} from "./manifest/manifest.ts";
import {
	buildPackageExecutionRequest,
	executePackageCommandInTerminal,
	executeTaskPlanInTerminal,
} from "./runner.ts";

type CommandHandler = (...args: unknown[]) => Promise<void> | void;

const RUNTIME_ARGS_SPLIT_REGEX = /\s+/;

type JsonObject = Record<string, unknown>;

interface SerializedPosition {
	readonly line: number;
	readonly character: number;
}

interface SerializedRange {
	readonly start: SerializedPosition;
	readonly end: SerializedPosition;
}

interface SerializedLocation {
	readonly uri: string;
	readonly range: SerializedRange;
}

interface Commands {
	runPackageEntry: CommandHandler;
	checkPackage: CommandHandler;
	buildPackage: CommandHandler;
	runPackageTests: CommandHandler;
	runTask: CommandHandler;
	runTaskByName: CommandHandler;
	selectRunConfiguration: CommandHandler;
	runWithArgs: CommandHandler;
	editRunConfigurations: CommandHandler;
	fmt: CommandHandler;
	showReferences: CommandHandler;
	configureInlayHints: CommandHandler;
	showStatus: CommandHandler;
	showActions: CommandHandler;
	restartLsp: CommandHandler;
	startLsp: CommandHandler;
	stopLsp: CommandHandler;
	showLspOutput: CommandHandler;
	checkWorkspace: CommandHandler;
	buildWorkspace: CommandHandler;
	runWorkspaceTests: CommandHandler;
	fmtWorkspace: CommandHandler;
}

function activeUriFromArgs(args: readonly unknown[]): vscode.Uri | undefined {
	const candidate = args[0];
	if (candidate instanceof vscode.Uri) {
		return candidate;
	}
	if (typeof candidate === "string") {
		return candidate.startsWith("file://")
			? vscode.Uri.parse(candidate)
			: vscode.Uri.file(candidate);
	}
	return activeDocumentUri();
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function serializedPosition(value: unknown): SerializedPosition | undefined {
	if (value instanceof vscode.Position) {
		return { line: value["line"], character: value["character"] };
	}
	if (!isJsonObject(value)) {
		return undefined;
	}
	const line = asNumber(value["line"]);
	const character = asNumber(value["character"]);
	return line === undefined || character === undefined
		? undefined
		: { line, character };
}

function serializedRange(value: unknown): SerializedRange | undefined {
	if (value instanceof vscode.Range) {
		return {
			start: { line: value["start"].line, character: value["start"].character },
			end: { line: value["end"].line, character: value["end"].character },
		};
	}
	if (!isJsonObject(value)) {
		return undefined;
	}
	const start = serializedPosition(value["start"]);
	const end = serializedPosition(value["end"]);
	return start && end ? { start, end } : undefined;
}

function serializedLocation(value: unknown): SerializedLocation | undefined {
	if (value instanceof vscode.Location) {
		return {
			uri: value["uri"].toString(),
			range: {
				start: {
					line: value["range"].start.line,
					character: value["range"].start.character,
				},
				end: {
					line: value["range"].end.line,
					character: value["range"].end.character,
				},
			},
		};
	}
	if (!isJsonObject(value) || typeof value["uri"] !== "string") {
		return undefined;
	}
	const range = serializedRange(value["range"]);
	return range ? { uri: value["uri"], range } : undefined;
}

function toPosition(value: unknown): vscode.Position | undefined {
	const position = serializedPosition(value);
	return position
		? new vscode.Position(position.line, position.character)
		: undefined;
}

function toRange(value: SerializedRange): vscode.Range {
	return new vscode.Range(
		value["start"].line,
		value["start"].character,
		value["end"].line,
		value["end"].character,
	);
}

function toLocation(value: unknown): vscode.Location | undefined {
	const location = serializedLocation(value);
	return location
		? new vscode.Location(
				vscode.Uri.parse(location.uri),
				toRange(location.range),
			)
		: undefined;
}

function toReferenceLocations(value: unknown): vscode.Location[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((item) => {
		const location = toLocation(item);
		return location ? [location] : [];
	});
}

async function restartLspAfterSettingChange(lsp: LspController) {
	if (lsp.isRunning()) {
		await lsp.restart();
	}
}

async function packageRootFromArgs(args: readonly unknown[]) {
	const manifestPath = findOwningManifestPathForUri(activeUriFromArgs(args));
	if (!manifestPath) {
		vscode.window.showWarningMessage(
			"No owning musi.json for the selected file.",
		);
		return undefined;
	}
	try {
		return await loadPackageRoot(manifestPath);
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to read owning musi.json: ${String(error)}`,
		);
		return undefined;
	}
}

async function workspacePackageRootFromArgs(args: readonly unknown[]) {
	const manifestPath = findWorkspaceManifestPathForUri(activeUriFromArgs(args));
	if (!manifestPath) {
		vscode.window.showWarningMessage(
			"No owning musi.json for the selected file.",
		);
		return undefined;
	}
	try {
		return await loadPackageRoot(manifestPath);
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to read owning musi.json: ${String(error)}`,
		);
		return undefined;
	}
}

function workspaceRequest(
	pkg: Awaited<ReturnType<typeof workspacePackageRootFromArgs>>,
) {
	if (!pkg) {
		return undefined;
	}
	return buildPackageExecutionRequest(pkg, {
		name: "Workspace",
		cliArgs: ["--workspace"],
	});
}

function createCommands(
	diagnostics: DiagnosticsController,
	lsp: LspController,
): Commands {
	return {
		async runPackageEntry(...args: unknown[]) {
			const pkg = await packageRootFromArgs(args);
			if (!pkg) {
				return;
			}
			const request = buildPackageExecutionRequest(pkg);
			await executePackageCommandInTerminal(request, "run");
		},

		async checkPackage(...args: unknown[]) {
			const pkg = await packageRootFromArgs(args);
			if (!pkg) {
				return;
			}
			await diagnostics.checkManifestPath(pkg.manifestPath);
		},

		async buildPackage(...args: unknown[]) {
			const pkg = await packageRootFromArgs(args);
			if (!pkg) {
				return;
			}
			const request = buildPackageExecutionRequest(pkg);
			await executePackageCommandInTerminal(request, "build");
		},

		async runPackageTests(...args: unknown[]) {
			const pkg = await packageRootFromArgs(args);
			if (!pkg) {
				return;
			}
			const request = buildPackageExecutionRequest(pkg);
			await executePackageCommandInTerminal(request, "test");
		},

		async runTask(...args: unknown[]) {
			const pkg = await packageRootFromArgs(args);
			if (!pkg) {
				return;
			}

			const tasks = taskSpecs(pkg);
			if (tasks.length === 0) {
				vscode.window.showWarningMessage(
					"No tasks defined in the owning musi.json.",
				);
				return;
			}

			const items: vscode.QuickPickItem[] = tasks.map((task) => {
				const item: vscode.QuickPickItem = {
					label: task.name,
					description: task.description ?? task.command,
				};
				if (task.dependencies.length > 0) {
					item.detail = `depends on ${task.dependencies.join(", ")}`;
				}
				return item;
			});

			const pick = await vscode.window.showQuickPick(items, {
				placeHolder: "Select Musi task",
			});
			if (!pick) {
				return;
			}

			try {
				const plan = taskPlan(pkg, pick.label);
				const request = buildPackageExecutionRequest(pkg);
				await executeTaskPlanInTerminal(request, plan);
			} catch (error) {
				vscode.window.showErrorMessage(String(error));
			}
		},

		async runTaskByName(...args: unknown[]) {
			const manifestArg = typeof args[0] === "string" ? args[0] : undefined;
			const taskName = typeof args[1] === "string" ? args[1] : undefined;
			const manifestUri = manifestArg
				? vscode.Uri.parse(manifestArg)
				: activeDocumentUri();
			const manifestPath = findOwningManifestPathForUri(manifestUri);
			if (!(manifestPath && taskName)) {
				vscode.window.showWarningMessage(
					"Task command requires an owning musi.json and task name.",
				);
				return;
			}
			try {
				const pkg = await loadPackageRoot(manifestPath);
				const plan = taskPlan(pkg, taskName);
				const request = buildPackageExecutionRequest(pkg);
				await executeTaskPlanInTerminal(request, plan);
			} catch (error) {
				vscode.window.showErrorMessage(String(error));
			}
		},

		async selectRunConfiguration(...args: unknown[]) {
			const pkg = await packageRootFromArgs(args);
			if (!pkg) {
				return;
			}
			const configs = getConfig().runConfigurations;
			if (configs.length === 0) {
				vscode.window.showWarningMessage("No Musi run configurations defined.");
				return;
			}

			const pick = await vscode.window.showQuickPick(
				configs.map((config) => ({
					label: config.name,
					description: config.entry ?? pkg.mainEntry,
				})),
				{ placeHolder: "Select Musi run configuration" },
			);
			if (!pick) {
				return;
			}

			const selected = configs.find((config) => config.name === pick.label);
			if (!selected) {
				return;
			}

			try {
				const request = buildPackageExecutionRequest(pkg, selected);
				const preLaunchPlan = selected.preLaunchTask
					? taskPlan(pkg, selected.preLaunchTask)
					: [];
				await executePackageCommandInTerminal(request, "run", preLaunchPlan);
			} catch (error) {
				vscode.window.showErrorMessage(String(error));
			}
		},

		async runWithArgs(...args: unknown[]) {
			const pkg = await packageRootFromArgs(args);
			if (!pkg) {
				return;
			}
			const value = await vscode.window.showInputBox({
				prompt: "Runtime arguments for the package entry",
				placeHolder: "--flag value",
			});
			if (value === undefined) {
				return;
			}
			const runtimeArgs = value.split(RUNTIME_ARGS_SPLIT_REGEX).filter(Boolean);
			const request = buildPackageExecutionRequest(pkg, {
				name: "Run with Arguments",
				runtimeArgs,
			});
			await executePackageCommandInTerminal(request, "run");
		},

		async editRunConfigurations() {
			await vscode.commands.executeCommand(
				"workbench.action.openSettings",
				"musi.runConfigurations",
			);
		},

		async fmt() {
			await formatActiveDocumentWithCli();
		},

		async showReferences(...args: unknown[]) {
			const uri = activeUriFromArgs(args);
			const position = toPosition(args[1]);
			const locations = toReferenceLocations(args[2]);
			if (!(uri && position && locations.length > 0)) {
				return;
			}
			await vscode.commands.executeCommand(
				"editor.action.showReferences",
				uri,
				position,
				locations,
			);
		},

		async configureInlayHints() {
			const config = getConfig();
			const items: Array<
				vscode.QuickPickItem & {
					parameterNames?: "none" | "literals" | "all";
					variableTypes?: boolean;
				}
			> = [
				{
					label: "$(symbol-parameter) Parameters for literals",
					description: "Recommended",
					detail:
						"Show call-site names where arguments are numbers, strings, or templates.",
					parameterNames: "literals",
				},
				{
					label: "$(symbol-parameter) Parameters for all arguments",
					detail:
						"Show every positional argument name, useful while learning a package API.",
					parameterNames: "all",
				},
				{
					label: "$(circle-slash) Hide parameter names",
					detail: "Keep call sites compact and rely on signature help.",
					parameterNames: "none",
				},
				{
					label: config.inlayHints.variableTypes
						? "$(eye-closed) Hide inferred types"
						: "$(symbol-type-parameter) Show inferred types",
					detail:
						"Toggle binding type hints for declarations without explicit annotations.",
					variableTypes: !config.inlayHints.variableTypes,
				},
			];
			const pick = await vscode.window.showQuickPick(items, {
				placeHolder: "Configure Musi inlay hints",
			});
			if (!pick) {
				return;
			}
			const cfg = vscode.workspace.getConfiguration("musi");
			if (pick.parameterNames !== undefined) {
				await cfg.update(
					"inlayHints.parameterNames.enabled",
					pick.parameterNames,
					vscode.ConfigurationTarget.Workspace,
				);
			}
			if (pick.variableTypes !== undefined) {
				await cfg.update(
					"inlayHints.variableTypes.enabled",
					pick.variableTypes,
					vscode.ConfigurationTarget.Workspace,
				);
			}
			await restartLspAfterSettingChange(lsp);
		},

		async showStatus() {
			const uri = activeDocumentUri();
			const manifestPath = findOwningManifestPathForUri(uri);
			const items: vscode.QuickPickItem[] = [
				{
					label: lsp.isRunning()
						? "$(check) Language server running"
						: "$(circle-slash) Language server stopped",
					detail: lsp.isRunning()
						? "Hover, completions, semantic tokens, references, formatting, and inlay hints come from musi_lsp."
						: "Fallback CLI diagnostics are active when the language server is unavailable.",
				},
				{
					label: `$(pulse) Diagnostics: ${diagnostics.mode()}`,
					detail:
						"Full uses CLI checks; manifest-only lets the language server own file diagnostics.",
				},
				{
					label: manifestPath
						? `$(root-folder) Package: ${manifestPath}`
						: "$(warning) No owning musi.json",
					detail:
						"Commands run from the package root discovered from the active editor.",
				},
			];
			await vscode.window.showQuickPick(items, {
				placeHolder: "Musi status",
			});
		},

		async showActions(...args: unknown[]) {
			const items: Array<
				vscode.QuickPickItem & { command?: string; args?: unknown[] }
			> = [
				{
					label: "Project",
					kind: vscode.QuickPickItemKind.Separator,
				},
				{
					label: "$(play) Run current package",
					description: "musi run",
					detail:
						"Run the entry from the owning musi.json with configured runtime arguments.",
					command: "musi.runPackageEntry",
				},
				{
					label: "$(beaker) Test current package",
					description: "musi test",
					detail: "Run package tests from the same root as the active file.",
					command: "musi.runPackageTests",
				},
				{
					label: "$(tools) Build current package",
					description: "musi build",
					detail: "Build the owning package before running or publishing it.",
					command: "musi.buildPackage",
				},
				{
					label: "$(checklist) Check current package",
					description: "musi check",
					detail: "Refresh diagnostics for the active package.",
					command: "musi.checkPackage",
				},
				{
					label: "Workspace",
					kind: vscode.QuickPickItemKind.Separator,
				},
				{
					label: "$(check-all) Check workspace",
					description: "musi check --workspace",
					detail:
						"Run the workspace diagnostic pass from the workspace manifest.",
					command: "musi.checkWorkspace",
				},
				{
					label: "$(beaker) Test workspace",
					description: "musi test --workspace",
					detail: "Run all workspace package tests.",
					command: "musi.runWorkspaceTests",
				},
				{
					label: "$(package) Build workspace",
					description: "musi build --workspace",
					detail: "Build every workspace member.",
					command: "musi.buildWorkspace",
				},
				{
					label: "$(wand) Format workspace",
					description: "musi fmt --all",
					detail: "Format every Musi source file in the workspace.",
					command: "musi.fmtWorkspace",
				},
				{
					label: "Editor",
					kind: vscode.QuickPickItemKind.Separator,
				},
				{
					label: "$(symbol-parameter) Configure inlay hints",
					description: "parameters and inferred types",
					detail:
						"Choose literal-only or all argument hints and toggle inferred type hints.",
					command: "musi.configureInlayHints",
				},
				{
					label: "$(json) Edit run configurations",
					description: "settings.json",
					detail: "Open Musi run configuration settings.",
					command: "musi.editRunConfigurations",
				},
				{
					label: "Language Server",
					kind: vscode.QuickPickItemKind.Separator,
				},
				{
					label: "$(pulse) Show status",
					description: "LSP and diagnostics",
					detail: "Inspect the active package, diagnostic mode, and LSP state.",
					command: "musi.showStatus",
				},
				{
					label: "$(debug-restart) Restart language server",
					description: "musi_lsp",
					detail:
						"Reload language-server settings and rebuild editor analysis state.",
					command: "musi.restartLsp",
				},
				{
					label: "$(output) Show LSP output",
					description: "logs",
					detail: "Open the Musi language-server output channel.",
					command: "musi.showLspOutput",
				},
			];
			const pick = await vscode.window.showQuickPick(items, {
				placeHolder: "Musi command center",
				matchOnDescription: true,
				matchOnDetail: true,
			});
			if (pick?.command) {
				await vscode.commands.executeCommand(
					pick.command,
					...(pick.args ?? args),
				);
			}
		},

		async restartLsp() {
			const ok = await lsp.restart();
			const message = ok ? "Musi LSP restarted." : "Musi LSP did not start.";
			await vscode.window.showInformationMessage(message);
		},

		async startLsp() {
			const ok = await lsp.start();
			const message = ok ? "Musi LSP started." : "Musi LSP did not start.";
			await vscode.window.showInformationMessage(message);
		},

		async stopLsp() {
			await lsp.stop();
			await vscode.window.showInformationMessage("Musi LSP stopped.");
		},

		showLspOutput() {
			lsp.showOutput();
		},

		async checkWorkspace(...args: unknown[]) {
			const request = workspaceRequest(
				await workspacePackageRootFromArgs(args),
			);
			if (!request) {
				return;
			}
			await executePackageCommandInTerminal(request, "check");
		},

		async buildWorkspace(...args: unknown[]) {
			const request = workspaceRequest(
				await workspacePackageRootFromArgs(args),
			);
			if (!request) {
				return;
			}
			await executePackageCommandInTerminal(request, "build");
		},

		async runWorkspaceTests(...args: unknown[]) {
			const request = workspaceRequest(
				await workspacePackageRootFromArgs(args),
			);
			if (!request) {
				return;
			}
			await executePackageCommandInTerminal(request, "test");
		},

		async fmtWorkspace(...args: unknown[]) {
			const pkg = await workspacePackageRootFromArgs(args);
			if (!pkg) {
				return;
			}
			const request = buildPackageExecutionRequest(pkg, {
				name: "Format Workspace",
				cliArgs: ["--all"],
			});
			await executePackageCommandInTerminal(request, "fmt");
		},
	};
}

export function clearCliCache() {
	// CLI lookup is stateless; the command surface keeps this hook for config refreshes.
}

export function registerCommands(
	context: vscode.ExtensionContext,
	diagnostics: DiagnosticsController,
	lsp: LspController,
) {
	const commands = createCommands(diagnostics, lsp);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"musi.runPackageEntry",
			commands.runPackageEntry,
		),
		vscode.commands.registerCommand("musi.checkPackage", commands.checkPackage),
		vscode.commands.registerCommand("musi.buildPackage", commands.buildPackage),
		vscode.commands.registerCommand(
			"musi.runPackageTests",
			commands.runPackageTests,
		),
		vscode.commands.registerCommand("musi.runTask", commands.runTask),
		vscode.commands.registerCommand(
			"musi.runTaskByName",
			commands.runTaskByName,
		),
		vscode.commands.registerCommand(
			"musi.selectRunConfiguration",
			commands.selectRunConfiguration,
		),
		vscode.commands.registerCommand("musi.runWithArgs", commands.runWithArgs),
		vscode.commands.registerCommand(
			"musi.editRunConfigurations",
			commands.editRunConfigurations,
		),
		vscode.commands.registerCommand("musi.fmt", commands.fmt),
		vscode.commands.registerCommand(
			"musi.showReferences",
			commands.showReferences,
		),
		vscode.commands.registerCommand(
			"musi.configureInlayHints",
			commands.configureInlayHints,
		),
		vscode.commands.registerCommand("musi.showStatus", commands.showStatus),
		vscode.commands.registerCommand("musi.showActions", commands.showActions),
		vscode.commands.registerCommand("musi.restartLsp", commands.restartLsp),
		vscode.commands.registerCommand("musi.startLsp", commands.startLsp),
		vscode.commands.registerCommand("musi.stopLsp", commands.stopLsp),
		vscode.commands.registerCommand(
			"musi.showLspOutput",
			commands.showLspOutput,
		),
		vscode.commands.registerCommand(
			"musi.checkWorkspace",
			commands.checkWorkspace,
		),
		vscode.commands.registerCommand(
			"musi.buildWorkspace",
			commands.buildWorkspace,
		),
		vscode.commands.registerCommand(
			"musi.runWorkspaceTests",
			commands.runWorkspaceTests,
		),
		vscode.commands.registerCommand("musi.fmtWorkspace", commands.fmtWorkspace),
	);
}
