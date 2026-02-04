const { execFile } = require("child_process");

/**
 * Project-wide Ruff linter using the indie linter API.
 * Scans all project files from disk via ruff check and reports
 * results through the linter-bundle IndieDelegate.
 */
class ProjectLinter {
  constructor() {
    this.indieDelegate = null;
    this.scanning = false;
    /** @type {Set<string>} File paths currently holding indie messages */
    this.trackedFiles = new Set();
    /** @type {Object|null} Reference to main module for config access */
    this.main = null;
  }

  /**
   * Store the IndieDelegate obtained from linter-bundle.
   * @param {IndieDelegate} delegate
   * @param {Object} main - Reference to main module for config access
   */
  register(delegate, main) {
    this.indieDelegate = delegate;
    this.main = main;
  }

  /**
   * Run ruff check on a project path and return parsed JSON results.
   * @param {string} projectPath
   * @returns {Promise<Array>}
   */
  execRuff(projectPath) {
    return new Promise((resolve) => {
      const args = ["check", "--quiet", "--output-format=json", projectPath];
      this.main.appendCheckArgs(args);
      const opts = {
        timeout: 10 * 1e4,
        cwd: projectPath,
        maxBuffer: 1024 * 1024 * 100,
      };

      execFile(this.main.executable, args, opts, (error, stdout, stderr) => {
        if (stderr) {
          console.error("[linter-ruff] Project scan stderr:", stderr);
          resolve([]);
          return;
        }
        if (!stdout || !stdout.trim()) {
          resolve([]);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          console.error("[linter-ruff] Project scan JSON parse error:", err);
          resolve([]);
        }
      });
    });
  }

  /**
   * Run the project-wide ruff scan.
   * Skips files currently open in editors (handled by file-scoped linter).
   * Clears stale messages for files no longer in results.
   */
  async runScan() {
    if (!this.indieDelegate || !this.main) return;
    if (this.scanning) return;

    this.scanning = true;

    const openPaths = new Set(
      atom.workspace
        .getTextEditors()
        .map((e) => e.getPath())
        .filter(Boolean)
    );

    const projectPaths = atom.project.getPaths();
    if (!projectPaths.length) {
      this.scanning = false;
      return;
    }

    const allMessages = [];

    try {
      for (const projectPath of projectPaths) {
        const items = await this.execRuff(projectPath);

        for (const item of items) {
          const filePath = item.filename;
          if (!filePath) continue;
          if (openPaths.has(filePath)) continue;

          const msg = this.main.convertMessage(filePath, item);
          if (msg) allMessages.push(msg);
        }
      }

      this.indieDelegate.setAllMessages(allMessages, {
        showProjectView: true,
      });
      this.trackedFiles = new Set(
        allMessages.map((m) => m.location.file)
      );
    } catch (error) {
      console.error("[linter-ruff] Project scan failed:", error);
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Clear indie messages for a specific file.
   * Called when a file is opened in an editor (deduplication).
   * @param {string} filePath
   */
  clearFileMessages(filePath) {
    if (this.indieDelegate && filePath && this.trackedFiles.has(filePath)) {
      this.indieDelegate.setMessages(filePath, []);
      this.trackedFiles.delete(filePath);
    }
  }

  /**
   * Clear all indie messages.
   */
  clearAllMessages() {
    if (this.indieDelegate) {
      this.indieDelegate.clearMessages();
      this.trackedFiles.clear();
    }
  }

  /**
   * Dispose all resources.
   */
  dispose() {
    this.clearAllMessages();
    this.main = null;
    this.indieDelegate = null;
  }
}

module.exports = new ProjectLinter();
