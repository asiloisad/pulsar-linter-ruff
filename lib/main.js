const { CompositeDisposable, File } = require('atom')
const { execFile } = require('child_process')
const path = require('path')
const os = require('os')

const tmp = require('tmp')
tmp.setGracefulCleanup()

module.exports = {

  activate() {
    this.tmpobj = tmp.fileSync({ postfix:'.py' })
    this.disposables = new CompositeDisposable()
    this.disposables.add(
      atom.config.observe("linter-ruff.state", (value) => {
        this.state = value
      }),
      atom.config.observe("linter-ruff.executable", (value) => {
        this.executable = value
      }),
      atom.config.observe("linter-ruff.configPath", (value) => {
        this.config = value
      }),
      atom.config.observe("linter-ruff.pyVersion", (value) => {
        this.pyVersion = value
      }),
      atom.config.observe("linter-ruff.useNoqa", (value) => {
        this.useNoqa = value
      }),
      atom.config.observe("linter-ruff.addStar", (value) => {
        this.addStar = value
      }),
      atom.config.observe("linter-ruff.allowMagic", (value) => {
        this.allowMagic = value
      }),
      atom.config.observe("linter-ruff.select", (value) => {
        this.select = value
      }),
      atom.config.observe("linter-ruff.ignore", (value) => {
        this.ignore = value
      }),
      atom.config.observe("linter-ruff.fixable", (value) => {
        this.fixable = value
      }),
      atom.config.observe("linter-ruff.unfixable", (value) => {
        this.unfixable = value
      }),
      atom.config.observe("linter-ruff.error", (value) => {
        this.error = this.parseClass(value)
      }),
      atom.config.observe("linter-ruff.warning", (value) => {
        this.warning = this.parseClass(value)
      }),
      atom.config.observe("linter-ruff.info", (value) => {
        this.info = this.parseClass(value)
      }),
      atom.commands.add('atom-workspace', {
        'linter-ruff:toggle-state': () => {
          atom.config.set("linter-ruff.state", !this.state)
        },
        'linter-ruff:toggle-noqa': () => {
          atom.config.set("linter-ruff.useNoqa", !this.useNoqa)
        },
        'linter-ruff:global-pyproject': () => {
          this.openDefaultConfig()
        },
      }),
      atom.commands.add('atom-text-editor[data-grammar="source python"]:not([mini])', {
        'linter-ruff:fix': () => {
          this.lint(atom.workspace.getActiveTextEditor(), true)
        },
        'linter-ruff:format-editor': () => {
          this.formatter(true)
        },
        'linter-ruff:format-selected': () => {
          this.formatter(false)
        },
      }),
    )
    this.grammarScopes = ['source.python', 'source.python.django']
  },

  deactivate() {
    this.disposables.dispose()
    this.tmpobj.removeCallback()
  },

  provideLinter() {
    return {
      name: 'ruff',
      scope: 'file',
      lintsOnChange: true,
      grammarScopes: this.grammarScopes,
      lint: this.lint.bind(this),
    }
  },

  lint(editor, fix=false) {
    if (!this.grammarScopes.includes(editor.getGrammar().scopeName)) {
      return
    }
    return new Promise((resolve, reject) => {
      if (!this.state) {
        return resolve([])
      }
      let editorPath = editor.getPath()
      let editorText = editor.getText()
      let hiddenlines = 0
      if (this.allowMagic) {
        editorText = editorText.replace(/^%/gm, '# %')
        editorText = '_ = 0 ; __ = 0 ; ___ = 0\n'+editorText
        hiddenlines += 1
      }
      new File(this.tmpobj.name).write(editorText).then(() => {
        let args = [
          'check',
          this.tmpobj.name,
          '--quiet',
          '--output-format=json',
          '--no-cache',
        ]
        if (this.select.length) {
          args.push(`--select=${this.select.join(",")}`)
        }
        if (this.ignore.length) {
          args.push(`--ignore=${this.ignore.join(",")}`)
        }
        if (this.fixable.length) {
          args.push(`--fixable=${this.fixable.join(",")}`)
        }
        if (this.unfixable.length) {
          args.push(`--unfixable=${this.unfixable.join(",")}`)
        }
        if (!this.useNoqa) {
          args.push('--ignore-noqa')
        }
        if (this.pyVersion) {
          args.push(`--target-version=${this.pyVersion}`)
        }
        if (fix) {
          args.push('--fix-only')
        }
        let opts = {
          timeout: 10*1e4,
          cwd: path.dirname(editorPath),
          maxBuffer: 1024*1024*100,
        }
        execFile(this.executable, args, opts, (error, stdout, stderr) => {
          if (stderr) {
            reject(error)
            return
          } else if (fix) {
            new File(this.tmpobj.name).read().then(
              (newText) => {
                editor.setText(newText)
                resolve()
              }
            )
          } else {
            let items
            try {
              items = JSON.parse(stdout)
            } catch (err) {
              reject(err)
              return
            }
            let data = []
            let severity
            for (let item of Object.values(items)) {
              if (item.location.row<=hiddenlines) {
                continue
              } else if (item.code===null || item.code==='E999') {
                severity = 'error'
                item.location.column = 1
                item.code = null
              } else if (this.error(item.code)) {
                severity = 'error'
              } else if (this.warning(item.code)) {
                severity = 'warning'
              } else if (this.info(item.code)) {
                severity = 'info'
              } else {
                severity = 'error'
                if (this.addStar) {
                  item.code += '*'
                }
              }
              data.push({
                severity: severity,
                linterName: 'ruff',
                excerpt: item.code ? item.message : `${item.code} — ${item.message}`,
                location: {
                  file: editorPath,
                  position: [
                    [
                      item.location.row-1-hiddenlines,
                      item.location.column-1,
                    ],
                    [
                      item.end_location.row-1-hiddenlines,
                      item.end_location.column-1,
                    ]
                  ],
                },
              })
            }
            resolve(data)
          }
        })
      })
    })
  },

  parseClass(patterns) {
    return (code) => {
      for (let pattern of patterns) {
        if (code.startsWith(pattern)) {
          return true
        }
      }
      return false
    }
  },

  getDefaultConfigPath() {
    let platform = os.platform()
    if (platform==='win32') {
      return path.join(os.homedir(), 'AppData', 'Roaming', 'ruff', 'pyproject.toml')
    } else {
      atom.notifications.addError(`Default config path has not been set on platform "${platform}"`)
    }
  },

  openDefaultConfig() {
    let configPath = this.getDefaultConfigPath()
    if (!configPath) { return }
    atom.workspace.open(configPath)
  },

  formatter(mode) {
    const editor = atom.workspace.getActiveTextEditor()
    let editorPath = editor.getPath()
    let selections = mode ? [editor] : editor.getSelections()
    for (let selection of selections) {
      if (selection.isEmpty()) { continue }
      let selectionText = selection.getText()
      new File(this.tmpobj.name).write(selectionText).then(() => {
        let args = [
          'format',
          this.tmpobj.name,
          '--quiet',
          '--no-cache',
        ]
        let opts = {
          timeout: 10*1e4,
          cwd: path.dirname(editorPath),
          maxBuffer: 1024*1024*100,
        }
        execFile(this.executable, args, opts, (error, stdout, stderr) => {
          if (stderr) {
            atom.notifications.addError('`ruff` formatter has failed')
          } else {
            new File(this.tmpobj.name).read().then((newText) => {
              if (mode) {
                let curPos = editor.getCursorBufferPosition()
                editor.setText(newText)
                editor.setCursorBufferPosition(curPos)
              } else {
                selection.insertText(newText, { select:true })
              }
            })
          }
        })
      })
    }
  },
}
