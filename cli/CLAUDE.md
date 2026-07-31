# CLAUDE.md for HiperRouter CLI

This file provides guidance for Claude Code when working in the `cli/` directory.

## Overview
This is the **CLI launcher** package for HiperRouter. It is published to npm as `hiperrouter`. Its purpose is to install, start, and manage the main gateway server and tray icon.

- It has its own `package.json`, version, and build process.
- The main application logic is in the root of the repository, not here. This is just the launcher.

## Commands
Run these from the `cli/` directory.

```bash
# To run in development with watch mode
npm run dev

# To build and package for local installation
# (run from the repository root)
npm run cli:pack 
```

## Conventions
- This package is versioned independently from the main app.
- Commits affecting the CLI should be prefixed with `feat(cli):` or `fix(cli):`.
- Focus is on installation, process management, and platform integration (tray icon, startup). Avoid adding gateway logic here.
