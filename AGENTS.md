# Repository Guidelines

## Project Structure & Module Organization

This is a zero-dependency magpie/OpenCode provider plugin. `index.mjs` contains the model catalog, protocol adapters, authentication loader and provider hooks. `index.test.mjs` holds the offline Bun tests. Keep the icon in `assets/icon.png`, its embedding script in `scripts/`, and GitHub Actions workflows in `.github/workflows/`.

Keep protocol-specific behavior in helpers rather than duplicating provider hooks. Do not add image-generation models to the chat catalog unless magpie gains an image API provider type.

## Build, Test, and Development Commands

Run `bun test` for the offline unit suite. Run `bun run icon` after changing `assets/icon.png` to update `package.json`. Install the working copy with `magpie plugin add .`; test a live account with `magpie provider test sensenova sensenova-6.8-flash-lite`.

No build or dependency installation is required. Keep runtime dependencies at zero because plugins load into magpie's host process.

## Coding Style & Naming Conventions

Use modern JavaScript ES modules, two-space indentation, double quotes and no semicolons, matching `index.mjs`. Use descriptive camelCase helpers and UPPER_SNAKE_CASE constants.

Name SenseNova integration components explicitly rather than using ambiguous names such as `api` or `helper`. Keep public interfaces small and validate external responses at the integration boundary.

## Testing Guidelines

Add `test(...)` cases to `index.test.mjs` for every behavior change and run `bun test`. Cover protocol differences, model metadata, configuration merging, authentication and network failures without making live API calls.

Document any coverage threshold once a coverage tool is introduced.

## Commit & Pull Request Guidelines

There is no Git history from which to derive a convention. Use short, imperative commit subjects, optionally scoped by component, such as `client: handle SenseNova timeouts`. Keep each commit focused and ensure its tests pass.

Pull requests should explain the change, list verification performed, link relevant issues, and call out configuration or compatibility changes. Include screenshots only for user-visible interface work.

## Security & Configuration

Read credentials from environment variables or a documented secret manager. Never commit API keys, tokens, or real service responses containing sensitive data; provide an `.env.example` with placeholder values when needed.
