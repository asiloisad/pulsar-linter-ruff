const { CompositeDisposable, Disposable } = require("atom");
const { execFile } = require("child_process");
const path = require("path");
const os = require("os");
const indie = require("./indie");

const IPYTHON_VARS_STUB = "_ = 0 ; __ = 0 ; ___ = 0";
const MAGIC_PLACEHOLDER_PREFIX = "linter-ruff-magic:";

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();

    // Migrate renamed config key
    const old = atom.config.get("linter-ruff.executable");
    if (old != null) {
      atom.config.set("linter-ruff.ruffCommand", old);
      atom.config.unset("linter-ruff.executable");
    }

    this.disposables.add(
      atom.config.observe("linter-ruff.state", (value) => {
        this.state = value;
      }),
      atom.config.observe("linter-ruff.ruffCommand", (value) => {
        const [exe, ...extra] = (value || "ruff").trim().split(/\s+/);
        this.ruffExe = exe;
        this.ruffExtraArgs = extra;
      }),
      atom.config.observe("linter-ruff.configPath", (value) => {
        this.config = value;
      }),
      atom.config.observe("linter-ruff.pyVersion", (value) => {
        this.pyVersion = value;
      }),
      atom.config.observe("linter-ruff.useNoqa", (value) => {
        this.useNoqa = value;
      }),
      atom.config.observe("linter-ruff.addStar", (value) => {
        this.addStar = value;
      }),
      atom.config.observe("linter-ruff.allowMagic", (value) => {
        this.allowMagic = value;
      }),
      atom.config.observe("linter-ruff.select", (value) => {
        this.select = value;
      }),
      atom.config.observe("linter-ruff.ignore", (value) => {
        this.ignore = value;
      }),
      atom.config.observe("linter-ruff.fixable", (value) => {
        this.fixable = value;
      }),
      atom.config.observe("linter-ruff.unfixable", (value) => {
        this.unfixable = value;
      }),
      atom.config.observe("linter-ruff.error", (value) => {
        this.isError = this.parseClass(value);
      }),
      atom.config.observe("linter-ruff.warning", (value) => {
        this.isWarning = this.parseClass(value);
      }),
      atom.config.observe("linter-ruff.info", (value) => {
        this.isInfo = this.parseClass(value);
      }),
      atom.commands.add("atom-workspace", {
        "linter-ruff:toggle-state": () => {
          atom.config.set("linter-ruff.state", !this.state);
        },
        "linter-ruff:toggle-noqa": () => {
          atom.config.set("linter-ruff.useNoqa", !this.useNoqa);
        },
        "linter-ruff:global-pyproject": () => {
          this.openDefaultConfigFile();
        },
        "linter-ruff:lint-projects": () => {
          indie.runScan();
        },
        "linter-ruff:lint-selected": () => {
          indie.runSelectedScan();
        },
      }),
      atom.commands.add(".tree-view", {
        "linter-ruff:lint-selected": () => {
          indie.runSelectedScan();
        },
      }),
      atom.commands.add('atom-text-editor[data-grammar="source python"]:not([mini])', {
        "linter-ruff:fix-all": () => {
          this.lint(atom.workspace.getActiveTextEditor(), true);
        },
        "linter-ruff:format-editor": () => {
          this.formatter(true);
        },
        "linter-ruff:format-selected": () => {
          this.formatter(false);
        },
      }),
    );
    this.grammarScopes = ["source.python", "source.python.django", "source.jupyter"];
  },

  deactivate() {
    indie.dispose();
    this.disposables.dispose();
  },

  provideLinter() {
    return {
      name: "Ruff",
      scope: "file",
      lintsOnChange: true,
      grammarScopes: this.grammarScopes,
      lint: this.lint.bind(this),
    };
  },

  consumeIndie(registerIndie) {
    const delegate = registerIndie({
      name: "Ruff/Project",
      deleteOnOpen: atom.config.get("linter-ruff.deleteOnOpen"),
    });
    this.disposables.add(delegate);
    indie.register(delegate, this);
  },

  consumeBusySignal(busySignal) {
    indie.setBusySignal(busySignal);
  },

  consumeTreeView(treeView) {
    indie.setTreeView(treeView);
    return new Disposable(() => {
      indie.setTreeView(null);
    });
  },

  lint(editor, fix = false) {
    const grammarScope = editor.getGrammar().scopeName;
    if (!this.grammarScopes.includes(grammarScope)) {
      return;
    }
    return new Promise((resolve, reject) => {
      if (!this.state) {
        return resolve([]);
      }
      let editorPath = editor.getPath();
      if (!editorPath) {
        return resolve([]);
      }
      let editorText = editor.getText();
      const isNotebook = grammarScope === "source.jupyter";
      const prepared = this.prepareEditorText(editorText, {
        includeIpythonVars: !fix,
        isNotebook,
      });
      editorText = prepared.text;

      let args = [
        ...this.ruffExtraArgs,
        "check",
        "--quiet",
        "--output-format=json",
        `--stdin-filename=${editorPath}`,
      ];
      this.appendCheckArgs(args);
      if (fix) {
        args.push("--fix-only");
      }
      const editorDir = path.dirname(editorPath);
      const cwd = editor.getBuffer().file?.existsSync() ? editorDir : undefined;
      let opts = {
        timeout: 10 * 1e4,
        cwd,
        maxBuffer: 1024 * 1024 * 100,
      };

      const child = execFile(this.ruffExe, args, opts, (error, stdout, stderr) => {
        if (error && error.code === "ENOENT") {
          atom.notifications.addError(`\`${this.ruffExe}\` not found.`, {
            description: `Check the "Ruff Command" setting in linter-ruff.`,
          });
          return resolve([]);
        }
        if (stderr) {
          reject(error);
          return;
        }
        if (fix) {
          editor.getBuffer().setTextViaDiff(this.restoreEditorText(stdout, prepared));
          resolve();
          return;
        }
        let items;
        try {
          items = JSON.parse(stdout);
        } catch (err) {
          reject(err);
          return;
        }
        let data = [];
        for (let item of Object.values(items)) {
          const msg = this.convertMessage(editorPath, item, prepared.hiddenlines, {
            notebookEditor: isNotebook ? editor.jupyterNotebookEditor : null,
          });
          if (msg) data.push(msg);
        }
        resolve(data);
      });

      child.stdin.write(editorText);
      child.stdin.end();
    });
  },

  prepareEditorText(text, { includeIpythonVars, isNotebook }) {
    if (!this.allowMagic || isNotebook) {
      return { text, hiddenlines: 0, magicLines: [], hasIpythonVars: false };
    }

    const magicLines = [];
    const preparedText = this.maskMagicLines(text, magicLines);
    if (!includeIpythonVars) {
      return { text: preparedText, hiddenlines: 0, magicLines, hasIpythonVars: false };
    }

    // Predefine special IPython variables to avoid undefined errors in diagnostics.
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    return {
      text: `${IPYTHON_VARS_STUB}${eol}${preparedText}`,
      hiddenlines: 1,
      magicLines,
      hasIpythonVars: true,
    };
  },

  maskMagicLines(text, magicLines) {
    const parts = text.split(/(\r\n|\n|\r)/);

    for (let index = 0; index < parts.length; index += 2) {
      const line = parts[index];
      const introspectionMatch = line.match(/^(\s*)(\?\??[\w.]+|\S+\?\??)(\s*)$/);
      if (!line.startsWith("%") && !introspectionMatch) {
        continue;
      }

      const indentation = introspectionMatch ? introspectionMatch[1] : "";
      parts[index] = `${indentation}# ${MAGIC_PLACEHOLDER_PREFIX}${magicLines.length}`;
      magicLines.push(line);
    }

    return parts.join("");
  },

  restoreEditorText(text, prepared) {
    const restoredText = prepared.hasIpythonVars ? this.removeIpythonVarsStub(text) : text;

    if (!prepared.magicLines.length) {
      return restoredText;
    }

    const parts = restoredText.split(/(\r\n|\n|\r)/);
    const placeholderPattern = new RegExp(`^\\s*# ${MAGIC_PLACEHOLDER_PREFIX}(\\d+)\\s*$`);

    for (let index = 0; index < parts.length; index += 2) {
      const match = parts[index].match(placeholderPattern);
      if (!match) {
        continue;
      }

      const originalLine = prepared.magicLines[Number(match[1])];
      if (originalLine != null) {
        parts[index] = originalLine;
      }
    }

    return parts.join("");
  },

  removeIpythonVarsStub(text) {
    for (const eol of ["\r\n", "\n", "\r"]) {
      const prefix = `${IPYTHON_VARS_STUB}${eol}`;
      if (text.startsWith(prefix)) {
        return text.slice(prefix.length);
      }
    }

    return text === IPYTHON_VARS_STUB ? "" : text;
  },

  appendCheckArgs(args) {
    if (this.select.length) {
      args.push(`--select=${this.select.join(",")}`);
    }
    if (this.ignore.length) {
      args.push(`--ignore=${this.ignore.join(",")}`);
    }
    if (this.fixable.length) {
      args.push(`--fixable=${this.fixable.join(",")}`);
    }
    if (this.unfixable.length) {
      args.push(`--unfixable=${this.unfixable.join(",")}`);
    }
    if (!this.useNoqa) {
      args.push("--ignore-noqa");
    }
    if (this.pyVersion) {
      args.push(`--target-version=${this.pyVersion}`);
    }
  },

  convertMessage(filePath, item, hiddenlines = 0, options = {}) {
    if (item.location.row <= hiddenlines) {
      return null;
    }

    let severity;
    if (item.code === null || item.code === "E999") {
      severity = "error";
      item.location.column = 1;
      item.code = null;
    } else if (this.isError(item.code)) {
      severity = "error";
    } else if (this.isWarning(item.code)) {
      severity = "warning";
    } else if (this.isInfo(item.code)) {
      severity = "info";
    } else {
      severity = "error";
      if (this.addStar) {
        item.code += "*";
      }
    }

    const message = {
      severity,
      excerpt: item.code ? `${item.code}: ${item.message}` : item.message,
      location: {
        file: filePath,
        position: [
          [item.location.row - 1 - hiddenlines, item.location.column - 1],
          [item.end_location.row - 1 - hiddenlines, item.end_location.column - 1],
        ],
      },
    };

    if (item.cell != null) {
      message.location.cell = item.cell;

      const cellEditor = options.notebookEditor?.getCellEditor?.(item.cell);
      const cellBuffer = cellEditor?.getBuffer?.();
      if (cellBuffer) {
        message.location.buffer = cellBuffer;
      }
    }

    return message;
  },

  parseClass(patterns) {
    return (code) => {
      for (let pattern of patterns) {
        if (code.startsWith(pattern)) {
          return true;
        }
      }
      return false;
    };
  },

  getDefaultConfigPath() {
    let platform = os.platform();
    if (platform === "win32") {
      return path.join(os.homedir(), "AppData", "Roaming", "ruff", "pyproject.toml");
    } else {
      atom.notifications.addError(`Default config path has not been set on platform "${platform}"`);
    }
  },

  openDefaultConfigFile() {
    let configPath = this.getDefaultConfigPath();
    if (!configPath) {
      return;
    }
    atom.workspace.open(configPath);
  },

  formatter(mode) {
    const editor = atom.workspace.getActiveTextEditor();
    let editorPath = editor.getPath();
    let selections = mode ? [editor] : editor.getSelections();
    for (let selection of selections) {
      if (selection.isEmpty()) {
        continue;
      }
      let selectionText = selection.getText();

      let args = [...this.ruffExtraArgs, "format", `--stdin-filename=${editorPath}`, "--quiet"];
      let opts = {
        timeout: 10 * 1e4,
        cwd: path.dirname(editorPath),
        maxBuffer: 1024 * 1024 * 100,
      };
      const child = execFile(this.ruffExe, args, opts, (error, stdout, stderr) => {
        if (stderr) {
          atom.notifications.addError("`ruff` formatter has failed");
        } else {
          if (mode) {
            let curPos = editor.getCursorBufferPosition();
            editor.setText(stdout);
            editor.setCursorBufferPosition(curPos);
          } else {
            selection.insertText(stdout, { select: true });
          }
        }
      });
      child.stdin.write(selectionText);
      child.stdin.end();
    }
  },
};
