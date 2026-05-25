# linter-ruff

A wrapper around Python linter called [ruff](https://github.com/astral-sh/ruff). Package used linter top-level API to visualize errors and other types of messages with ease.

Supports both `.py` files and Jupyter notebooks (`.ipynb`). In notebook mode, each code cell is linted individually and messages are mapped to the correct cell via [jupyter-next](https://github.com/asiloisad/pulsar-jupyter-next).

## Installation

To install `linter-ruff` search for [linter-ruff](https://web.pulsar-edit.dev/packages/linter-ruff) in the Install pane of the Pulsar settings or run `ppm install linter-ruff`. Alternatively, you can run `ppm install asiloisad/pulsar-linter-ruff` to install a package directly from the GitHub repository.

## Commands

Commands available in `atom-workspace`:

- `linter-ruff:toggle-state`: toggle config of linter state,
- `linter-ruff:toggle-noqa`: toggle config of noqa setting,
- `linter-ruff:lint-projects`: scan entire project for lint issues,
- `linter-ruff:lint-selected`: scan selected tree-view files or folders for lint issues,
- `linter-ruff:global-pyproject`: open ruff global config file.

Commands available in `atom-text-editor[data-grammar="source python"]:not([mini])`:

- `linter-ruff:fix-all`: attempt to fix violations,
- `linter-ruff:format-editor`: format text of current text-editor,
- `linter-ruff:format-selected`: format selections of current text-editor.

## ruff

A package ruff is an extremely fast Python linter, written in Rust. Ruff can be used to replace Flake8 (plus dozens of plugins), isort, pydocstyle, yesqa, eradicate, pyupgrade, and autoflake, all while executing tens or hundreds of times faster than any individual tool.

For command line use, ruff is installed with `pip install ruff`.

Ruff supports over 800 lint [rules](https://docs.astral.sh/ruff/rules/), many of which are inspired by popular tools like Flake8, isort, pyupgrade, and others. Regardless of the rule's origin, Ruff re-implements every rule in Rust as a first-party feature.

Ruff can attempt to automatically fix lint violations. List of rule codes to treat as eligible & ineligible can be set in package setting or in configuration file.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
