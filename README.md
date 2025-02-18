# linter-ruff

A wrapper around Python linter called [ruff](https://github.com/astral-sh/ruff). Package used [linter](https://github.com/steelbrain/linter) top-level API to visualize errors and other types of messages with ease.

## Installation

To install `linter-ruff` search for [linter-ruff](https://web.pulsar-edit.dev/packages/linter-ruff) in the Install pane of the Pulsar settings or run `ppm install linter-ruff`. Alternatively, you can run `ppm install asiloisad/pulsar-linter-ruff` to install a package directly from the Github repository.

## ruff

A package ruff is an extremely fast Python linter, written in Rust. Ruff can be used to replace Flake8 (plus dozens of plugins), isort, pydocstyle, yesqa, eradicate, pyupgrade, and autoflake, all while executing tens or hundreds of times faster than any individual tool.

For command line use, ruff is installed with `pip install ruff`.

Ruff supports over 800 lint [rules](https://docs.astral.sh/ruff/rules/), many of which are inspired by popular tools like Flake8, isort, pyupgrade, and others. Regardless of the rule's origin, Ruff re-implements every rule in Rust as a first-party feature.

Ruff can attempt to automatically fix lint violations. List of rule codes to treat as eligible & ineligible can be set in package setting or in configuration file.

## Commands

In `atom-workspace` there are available commands:

- `linter-ruff:toggle-state`: config toggle of linter state
- `linter-ruff:toggle-noqa`: config toggle of noqa setting
- `linter-ruff:global-pyproject`: open ruff default config file

In `atom-text-editor:not([mini])` there are available commands:

- `linter:lint`: run a linter manually (ref. [linter](https://github.com/steelbrain/linter))

In `atom-text-editor[data-grammar="source python"]:not([mini])` there are available commands:

- `linter-ruff:fix`: attempt to fix violations
- `linter-ruff:format-editor`: format text of current text-editor
- `linter-ruff:format-selected`: format selections of current text-editor

## Settings

The linter settings can be set by package options or via configuration file. The package options has higher priority, so if you want use configuration file, then leave empty `Rule selection` items.

A default configuration `pyproject.toml` can be opened (and created if doesn't exists) by command `linter-ruff:global-pyproject`.

The details of configuration file (e.g. commands, file discovery) can be found at ruff [config discovery](https://docs.astral.sh/ruff/configuration/#config-file-discovery).

# Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub — any feedback’s welcome!
