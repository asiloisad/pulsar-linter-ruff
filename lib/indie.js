const { BufferedProcess } = require("atom");
const fs = require("fs");
const path = require("path");

/**
 * Project-wide Ruff linter using the indie linter API.
 * Scans all project files from disk via ruff check and reports
 * results through the linter-bundle IndieDelegate.
 */
class ProjectLinter {
  constructor() {
    this.indieDelegate = null;
    this.busySignal = null;
    this.busyMessage = null;
    this.scanning = false;
    /** @type {Object|null} Reference to main module for config access */
    this.main = null;
    this.treeView = null;
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

  setBusySignal(busySignal) {
    this.busySignal = busySignal;
  }

  setTreeView(treeView) {
    this.treeView = treeView;
  }

  startBusyMessage() {
    this.disposeBusyMessage();
    if (this.busySignal && typeof this.busySignal.reportBusy === "function") {
      this.busyMessage = this.busySignal.reportBusy("Scanning project with Ruff");
    }
  }

  disposeBusyMessage() {
    if (this.busyMessage && typeof this.busyMessage.dispose === "function") {
      this.busyMessage.dispose();
    }
    this.busyMessage = null;
  }

  /**
   * Run ruff check on a project path and return parsed JSON results.
   * @param {string} projectPath
   * @param {string[]} targetPaths
   * @returns {Promise<Array>}
   */
  execRuff(projectPath, targetPaths = [projectPath]) {
    return new Promise((resolve) => {
      const args = [
        ...this.main.ruffExtraArgs,
        "check",
        "--quiet",
        "--output-format=json",
        ...targetPaths,
      ];
      this.main.appendCheckArgs(args);
      let stdout = "";
      let stderr = "";
      const proc = new BufferedProcess({
        command: this.main.ruffExe,
        args,
        options: { cwd: projectPath },
        stdout: (data) => {
          stdout += data;
        },
        stderr: (data) => {
          stderr += data;
        },
        exit: () => {
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
        },
      });
      proc.onWillThrowError(({ error, handle }) => {
        handle();
        resolve([]);
      });
    });
  }

  /**
   * Run the project-wide ruff scan.
   */
  getProjectPathForPath(filePath) {
    return atom.project.getPaths().find((projectPath) => {
      const relativePath = path.relative(projectPath, filePath);
      return (
        relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
      );
    });
  }

  getSelectedScanItems() {
    if (!this.treeView || typeof this.treeView.selectedPaths !== "function") return [];

    const selectedPaths = this.treeView
      .selectedPaths()
      .filter(Boolean)
      .filter((selectedPath, index, paths) => paths.indexOf(selectedPath) === index)
      .filter((selectedPath) => {
        try {
          return fs.existsSync(selectedPath);
        } catch {
          return false;
        }
      });

    const scanItemsByProject = new Map();
    for (const selectedPath of selectedPaths) {
      const projectPath = this.getProjectPathForPath(selectedPath);
      if (!projectPath) continue;

      if (!scanItemsByProject.has(projectPath)) {
        scanItemsByProject.set(projectPath, {
          projectPath,
          targetPaths: [],
        });
      }
      scanItemsByProject.get(projectPath).targetPaths.push(selectedPath);
    }

    return Array.from(scanItemsByProject.values());
  }

  runSelectedScan() {
    const scanItems = this.getSelectedScanItems();
    if (!scanItems.length) {
      atom.notifications.addWarning("Ruff selected scan skipped", {
        detail: "Select one or more files or folders in the tree view first.",
        dismissable: true,
      });
      return;
    }

    this.runScan(scanItems);
  }

  async runScan(scanItems = null) {
    if (!this.indieDelegate || !this.main) return;
    if (this.scanning) return;

    this.scanning = true;
    this.startBusyMessage();

    const resolvedScanItems =
      scanItems ||
      atom.project.getPaths().map((projectPath) => ({
        projectPath,
        targetPaths: [projectPath],
      }));
    if (!resolvedScanItems.length) {
      this.disposeBusyMessage();
      this.scanning = false;
      return;
    }

    const allMessages = [];

    try {
      for (const scanItem of resolvedScanItems) {
        const projectPath = scanItem.projectPath || scanItem;
        const targetPaths = scanItem.targetPaths || [projectPath];
        const items = await this.execRuff(projectPath, targetPaths);

        for (const item of items) {
          const filePath = item.filename;
          if (!filePath) continue;

          const msg = this.main.convertMessage(filePath, item);
          if (msg) allMessages.push(msg);
        }
      }

      this.indieDelegate.setAllMessages(allMessages, {
        showProjectView: true,
      });
    } catch (error) {
      console.error("[linter-ruff] Project scan failed:", error);
    } finally {
      this.scanning = false;
      this.disposeBusyMessage();
    }
  }

  /**
   * Dispose all resources.
   */
  dispose() {
    this.disposeBusyMessage();
    this.busySignal = null;
    this.treeView = null;
    this.main = null;
    this.indieDelegate = null;
  }
}

module.exports = new ProjectLinter();
