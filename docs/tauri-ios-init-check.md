# Tauri iOS Init Verification

## Canonical project folder
- In this environment, the only detected clone is: `/workspace/ExtraBrain`.
- No clone was found at `/Users/kevinhuiskes/Development/ExtraBrain`.

## `src-tauri/tauri.conf.json` verification
The config uses Tauri v2 keys:
- `identifier`
- `build.devUrl`
- `build.frontendDist`
- `app`
- `bundle`
- `plugins`

The config does **not** contain Tauri v1 keys:
- `devPath`
- `distDir`
- `package`
- `tauri`

## iOS init command output
Command run:

```bash
pnpm exec tauri ios init --config src-tauri/tauri.conf.json --verbose
```

Result:
- Failed with `error: unrecognized subcommand 'ios'`.
- This indicates the installed `@tauri-apps/cli` in this environment does not provide the `ios` subcommand.

## Duplicate clone cleanup
- Searched for duplicate `ExtraBrain` directories and found only `/workspace/ExtraBrain`.
- No duplicate clone was present to remove/archive in this environment.
