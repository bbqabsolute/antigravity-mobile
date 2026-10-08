/**
 * Antigravity Mobile - Terminal Controller
 * Provides interactive command-line access to Android shell
 */

class MobileTerminal {
    constructor() {
        this.outputElem = document.getElementById("terminalOutput");
        this.inputElem = document.getElementById("terminalInput");
        this.history = [];
        this.historyIndex = -1;
        this.init();
    }

    init() {
        if (!this.inputElem) return;

        this.inputElem.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this.executeCurrent();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });

        document.getElementById("btnRunTerm")?.addEventListener("click", () => {
            this.executeCurrent();
        });

        document.getElementById("btnClearTerminal")?.addEventListener("click", () => {
            this.clear();
        });

        // Quick command chips
        document.querySelectorAll(".term-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                const cmd = chip.getAttribute("data-cmd");
                if (cmd) {
                    this.inputElem.value = cmd;
                    this.executeCurrent();
                }
            });
        });
    }

    executeCurrent() {
        const cmd = this.inputElem.value.trim();
        if (!cmd) return;

        this.history.push(cmd);
        this.historyIndex = this.history.length;
        this.inputElem.value = "";

        this.runCommand(cmd);
    }

    navigateHistory(direction) {
        if (this.history.length === 0) return;
        this.historyIndex += direction;
        if (this.historyIndex < 0) this.historyIndex = 0;
        if (this.historyIndex > this.history.length) this.historyIndex = this.history.length;

        if (this.historyIndex < this.history.length) {
            this.inputElem.value = this.history[this.historyIndex];
        } else {
            this.inputElem.value = "";
        }
    }

    runCommand(cmd) {
        this.appendOutput(`<div class="term-line term-cmd">$ ${this.escapeHtml(cmd)}</div>`);

        if (!window.AntigravityBridge) {
            this.appendOutput(`<div class="term-line term-err">[Bridge not available: running in browser]</div>`);
            return;
        }

        const workspaceDir = window.appState ? window.appState.workspaceDir : "";
        try {
            const resJson = window.AntigravityBridge.executeShell(cmd, workspaceDir);
            const res = JSON.parse(resJson);

            if (res.stdout && res.stdout.trim()) {
                this.appendOutput(`<div class="term-line">${this.escapeHtml(res.stdout)}</div>`);
            }
            if (res.stderr && res.stderr.trim()) {
                this.appendOutput(`<div class="term-line term-err">${this.escapeHtml(res.stderr)}</div>`);
            }
            if (res.exitCode !== 0) {
                this.appendOutput(`<div class="term-line term-err">[Process exited with code ${res.exitCode}]</div>`);
            }
        } catch (e) {
            this.appendOutput(`<div class="term-line term-err">[Execution failed: ${this.escapeHtml(e.message)}]</div>`);
        }
    }

    appendOutput(html) {
        if (!this.outputElem) return;
        const line = document.createElement("div");
        line.innerHTML = html;
        this.outputElem.appendChild(line);
        this.outputElem.scrollTop = this.outputElem.scrollHeight;
    }

    clear() {
        if (this.outputElem) {
            this.outputElem.innerHTML = `<div class="term-welcome">[Terminal cleared]</div>`;
        }
    }

    escapeHtml(str) {
        return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

window.MobileTerminal = MobileTerminal;
