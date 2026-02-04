const { CompositeDisposable, File } = require("atom");
const { execFile } = require("child_process");
const path = require("path");
const os = require("os");
const indie = require("./indie");

/**
 * Linter Ruff Package
 * Provides Python linting using the Ruff linter.
 * Supports automatic and manual linting, formatting, and fixing.
 */
module.exports = {
  /**
   * Activates the package and sets up configuration observers.
   */
  activate() {
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      atom.config.observe("linter-ruff.state", (value) => {
        this.state = value;
      }),
      atom.config.observe("linter-ruff.executable", (value) => {
        this.executable = value;
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
        "linter-ruff:lint-project": () => {
          indie.runScan();
        },
      }),
      atom.commands.add(
        'atom-text-editor[data-grammar="source python"]:not([mini])',
        {
          "linter-ruff:fix-all": () => {
            this.lint(atom.workspace.getActiveTextEditor(), true);
          },
          "linter-ruff:format-editor": () => {
            this.formatter(true);
          },
          "linter-ruff:format-selected": () => {
            this.formatter(false);
          },
        }
      )
    );
    this.grammarScopes = ["source.python", "source.python.django"];

    // Clear indie messages when a file is opened (deduplication)
    this.disposables.add(
      atom.workspace.observeTextEditors((editor) => {
        const filePath = editor.getPath();
        if (filePath) {
          indie.clearFileMessages(filePath);
        }
      })
    );

    // Reset indie when project paths change
    this.disposables.add(
      atom.project.onDidChangePaths(() => {
        indie.clearAllMessages();
      })
    );
  },

  /**
   * Deactivates the package and disposes resources.
   */
  deactivate() {
    indie.dispose();
    this.disposables.dispose();
  },

  /**
   * Provides the linter interface for the linter package.
   * @returns {Object} Linter provider configuration
   */
  provideLinter() {
    return {
      name: "ruff",
      scope: "file",
      lintsOnChange: true,
      grammarScopes: this.grammarScopes,
      lint: this.lint.bind(this),
    };
  },

  /**
   * Consumes the indie linter service for project-wide scanning.
   * @param {Function} registerIndie - Registration function from linter-bundle
   */
  consumeIndie(registerIndie) {
    const delegate = registerIndie({ name: "ruff/Project" });
    this.disposables.add(delegate);
    indie.register(delegate, this);
  },

  /**
   * Lints the editor content using Ruff.
   * @param {TextEditor} editor - The text editor to lint
   * @param {boolean} fix - Whether to apply automatic fixes
   * @returns {Promise<Array>} Promise resolving to array of lint messages
   */
  lint(editor, fix = false) {
    if (!this.grammarScopes.includes(editor.getGrammar().scopeName)) {
      return;
    }
    return new Promise((resolve, reject) => {
      if (!this.state) {
        return resolve([]);
      }
      let editorPath = editor.getPath();
      let editorText = editor.getText();
      let hiddenlines = 0;
      if (this.allowMagic) {
        // Comment out magic commands (e.g., %timeit, %%capture)
        editorText = editorText.replace(/^%/gm, "# %");
        // Comment out IPython introspection syntax (e.g., np?, np??, ?np, ??np)
        editorText = editorText.replace(/^(\s*)(\?\??[\w.]+|\S+\?\??)(\s*)$/gm, "$1# $2$3");
        // Predefine special IPython variables to avoid undefined errors
        editorText = "_ = 0 ; __ = 0 ; ___ = 0\n" + editorText;
        hiddenlines += 1;
      }

      let args = [
        "check",
        "--quiet",
        "--output-format=json",
        `--stdin-filename=${editorPath}`,
      ];
      this.appendCheckArgs(args);
      if (fix) {
        args.push("--fix-only");
      }
      let opts = {
        timeout: 10 * 1e4,
        cwd: path.dirname(editorPath),
        maxBuffer: 1024 * 1024 * 100,
      };

      const child = execFile(
        this.executable,
        args,
        opts,
        (error, stdout, stderr) => {
          if (stderr) {
            reject(error);
            return;
          }
          if (fix) {
            editor.setText(stdout);
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
            const msg = this.convertMessage(editorPath, item, hiddenlines);
            if (msg) data.push(msg);
          }
          resolve(data);
        }
      );

      child.stdin.write(editorText);
      child.stdin.end();
    });
  },

  /**
   * Append config-based flags to a ruff check args array.
   * @param {string[]} args - Args array to mutate
   */
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

  /**
   * Convert a ruff JSON diagnostic to a linter message.
   * @param {string} filePath
   * @param {Object} item - Ruff diagnostic object
   * @param {number} [hiddenlines=0] - Number of hidden lines to offset
   * @returns {Object|null} Linter message or null if item should be skipped
   */
  convertMessage(filePath, item, hiddenlines = 0) {
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

    return {
      severity,
      excerpt: item.code
        ? `${item.code} — ${item.message}`
        : item.message,
      location: {
        file: filePath,
        position: [
          [item.location.row - 1 - hiddenlines, item.location.column - 1],
          [item.end_location.row - 1 - hiddenlines, item.end_location.column - 1],
        ],
      },
    };
  },

  /**
   * Creates a pattern matcher for severity classification.
   * @param {string[]} patterns - Array of code prefix patterns
   * @returns {Function} Function that tests if a code matches any pattern
   */
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

  /**
   * Gets the default Ruff configuration file path for the current platform.
   * @returns {string|undefined} The config path or undefined if unsupported
   */
  getDefaultConfigPath() {
    let platform = os.platform();
    if (platform === "win32") {
      return path.join(
        os.homedir(),
        "AppData",
        "Roaming",
        "ruff",
        "pyproject.toml"
      );
    } else {
      atom.notifications.addError(
        `Default config path has not been set on platform "${platform}"`
      );
    }
  },

  /**
   * Opens the default Ruff configuration file in the editor.
   */
  openDefaultConfigFile() {
    let configPath = this.getDefaultConfigPath();
    if (!configPath) {
      return;
    }
    atom.workspace.open(configPath);
  },

  /**
   * Formats the editor content or selection using Ruff.
   * @param {boolean} mode - True for whole editor, false for selection only
   */
  formatter(mode) {
    const editor = atom.workspace.getActiveTextEditor();
    let editorPath = editor.getPath();
    let selections = mode ? [editor] : editor.getSelections();
    for (let selection of selections) {
      if (selection.isEmpty()) {
        continue;
      }
      let selectionText = selection.getText();

      let args = ["format", `--stdin-filename=${editorPath}`, "--quiet"];
      let opts = {
        timeout: 10 * 1e4,
        cwd: path.dirname(editorPath),
        maxBuffer: 1024 * 1024 * 100,
      };
      const child = execFile(
        this.executable,
        args,
        opts,
        (error, stdout, stderr) => {
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
        }
      );
      child.stdin.write(selectionText);
      child.stdin.end();
    }
  },
};
