# Musi for Visual Studio Code

Musi language support for VS Code: syntax highlighting, language-server features, inlay hints, formatting, and package workflows for `.ms` projects.

## Features

- Syntax highlighting for `.ms` files and Musi fenced code blocks in Markdown
- Diagnostics, hover, semantic highlighting, references, formatting, and inlay hints from `musi_lsp` for `.ms` files
- Rust Analyzer style inlay hints for literal argument names and inferred binding types
- A Musi command center for package, workspace, editor, and language-server actions
- CLI-backed formatting for Musi Markdown fences without starting the LSP
- Package and workspace commands for run, check, build, test, and format actions
- `musi.json` schema validation
- Check-on-save fallback when LSP diagnostics are unavailable
- Named run configurations from VS Code settings
- Status and progress feedback for package checks and language-server startup, restart, and stop flows

## Requirements

Install the Musi tools and make them available on PATH:

- `musi` for package commands, fallback checks, and Markdown fence formatting
- `musi_lsp` for editor diagnostics, hover, semantic tokens, formatting, and inlay hints

If the binaries are not on PATH, configure:

```json
{
  "musi.cliPath": "/path/to/musi",
  "musi.lspPath": "/path/to/musi_lsp"
}
```

When working inside the Musi repository, the extension also checks workspace build outputs before falling back to Cargo bin and PATH.

## Package detection

The extension treats the closest ancestor `musi.json` as the owning package root. Package commands, run configurations, task execution, and check-on-save use that package root.

Files without an owning `musi.json` still get syntax highlighting. Package commands and package checks stay disabled until the file belongs to a package.

## Commands

Open the command palette and run `Musi: Open Command Center` for the main workflow picker. It groups actions into:

- Project: run, test, build, and check the owning package
- Workspace: check, test, build, and format the workspace
- Editor: configure inlay hints and edit run configurations
- Language Server: show status, restart `musi_lsp`, and open LSP output

Direct commands are also available:

- `Musi: Run Current Package`
- `Musi: Check Current Package`
- `Musi: Build Current Package`
- `Musi: Test Current Package`
- `Musi: Format Document`
- `Musi: Format Workspace`
- `Musi: Check Workspace`
- `Musi: Build Workspace`
- `Musi: Test Workspace`
- `Musi: Configure Inlay Hints`
- `Musi: Show Status`
- `Musi: Start Language Server`
- `Musi: Stop Language Server`
- `Musi: Restart Language Server`
- `Musi: Show Language Server Output`

## Inlay hints

Musi enables editor-friendly hints by default:

- Parameter name hints appear for literal arguments, such as numbers, strings, and templates.
- Inferred type hints appear for declarations without explicit annotations.
- Hints can be changed from `Musi: Configure Inlay Hints` without editing JSON.

Use `"musi.inlayHints.parameterNames.enabled": "all"` for every positional argument, or `"none"` to hide parameter names.

## Formatting

For `.ms` files, Format Document uses `musi_lsp` when the language server is running. If LSP formatting is unavailable, the extension falls back to `musi fmt`.

For Markdown files, Musi fenced code blocks are formatted with `musi fmt`. Markdown formatting does not start or attach the Musi LSP.

Formatter behavior comes from the owning package's `musi.json` plus VS Code formatting options where supported.

## Settings

Common settings:

```json
{
  "musi.cliPath": "musi",
  "musi.lspPath": "musi_lsp",
  "musi.lsp.enabled": true,
  "musi.checkOnSave": true,
  "musi.hover.maximumLength": 500,
  "musi.inlayHints.enabled": true,
  "musi.inlayHints.parameterNames.enabled": "literals",
  "musi.inlayHints.parameterNames.suppressWhenArgumentMatchesName": true,
  "musi.inlayHints.variableTypes.enabled": true,
  "musi.inlayHints.variableTypes.suppressWhenTypeMatchesName": true
}
```

Runtime and terminal settings:

```json
{
  "musi.runtime.args": [],
  "musi.runtime.env": {},
  "musi.runtime.envFile": "",
  "musi.runtime.cwd": "",
  "musi.terminal.clearBeforeRun": false,
  "musi.terminal.focusOnRun": true,
  "musi.terminal.reuseTerminal": true
}
```

Named run configuration example:

```json
{
  "musi.runConfigurations": [
    {
      "name": "dev",
      "entry": "index.ms",
      "runtimeArgs": ["--watch"],
      "env": {
        "MUSI_ENV": "dev"
      },
      "preLaunchTask": "build"
    }
  ]
}
```

## Markdown support

Musi code fences in Markdown use the `musi` or `ms` language tag:

````markdown
```musi
let total : Int := 42;
```
````

The extension highlights these fences and formats them through `musi fmt`.

## Troubleshooting

If diagnostics, hover, semantic highlighting, or formatting do not appear:

1. Run `Musi: Show Status`.
2. Run `Musi: Show Language Server Output`.
3. Confirm `musi_lsp` is installed or set `musi.lspPath`.
4. Confirm the file belongs to a package with an ancestor `musi.json`.
5. Run `Musi: Restart Language Server` after changing binary paths or inlay hint settings.

If package commands fail:

1. Confirm `musi` is installed or set `musi.cliPath`.
2. Check the package root detected from the nearest `musi.json`.
3. Verify runtime settings such as `musi.runtime.cwd`, `musi.runtime.env`, and `musi.runtime.envFile`.

## License

[MIT](LICENSE)
