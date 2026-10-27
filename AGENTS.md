# Repository Guidelines

## Project Structure & Module Organization

This zero-dependency magpie/OpenCode provider keeps its model catalog, protocol adapters, authentication and hooks in `index.mjs`. Offline Bun tests live in `index.test.mjs`; the icon is in `assets/icon.png`, with its embedding script in `scripts/embed-icon.mjs` and CI in `.github/workflows/`.

The provider ID is `sensenova`; the public export is `SenseNovaAuthPlugin`. Support Chat Completions, Anthropic Messages and Responses through the `protocol` option. Authenticated `provider.models` calls must prefer live `GET /v1/models` metadata and include new text models; retain the static catalog only on failure. Exclude image-only U1.5 models from chat providers.

## Build, Test, and Development Commands

Run `bun test` for the offline unit suite. Run `bun run icon` after changing `assets/icon.png` to update `package.json`. Install the working copy with `magpie plugin add .`; test a live account with `magpie provider test sensenova sensenova-6.8-flash-lite`.

Switch protocols with `magpie plugin options opencode-sensenova-auth '{"protocol":"anthropic"}'` (or `responses`). No build or dependency installation is required. Keep runtime dependencies at zero because plugins load into magpie's host process.

## Coding Style & Naming Conventions

Use modern JavaScript ES modules, two-space indentation, double quotes and no semicolons, matching `index.mjs`. Use descriptive camelCase helpers and UPPER_SNAKE_CASE constants.

Name SenseNova integration components explicitly rather than using ambiguous names such as `api` or `helper`. Keep public interfaces small and validate external responses at the integration boundary.

## Testing Guidelines

Add `test(...)` cases to `index.test.mjs` for every behavior change and run `bun test`. Cover protocol differences, model metadata, configuration merging, authentication and network failures without making live API calls.

Mock `fetch` and restore it in `finally`. No coverage threshold is configured. Run separate, low-token live checks when changing wire behavior, and record protocol limitations in `README.md`.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects, optionally scoped by component, such as `feat: add SenseNova model discovery`. Keep each commit focused and ensure its tests pass.

Pull requests should explain the change, list verification performed, link relevant issues, and call out configuration or compatibility changes. Include screenshots only for user-visible interface work.

## Security & Configuration

Never commit API keys or sensitive service responses. Send Bearer authentication only to `https://token.sensenova.cn` and never log keys in diagnostics.

## Release Guidelines

Bump `package.json` before tagging `v<version>`. Tag pushes run tests and publish through npm trusted publishing (OIDC); configure the package's trusted publisher before the first release. Keep version, tag and GitHub Release aligned.
