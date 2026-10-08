/**
 * Antigravity Mobile - File Browser & Code Editor
 */

class ProjectManager {
    constructor() {
        this.currentPath = "";
        this.currentEditingFile = null;

        this.filesListElem = document.getElementById("filesList");
        this.pathDisplayElem = document.getElementById("currentPathDisplay");
        this.editorOverlay = document.getElementById("editorOverlay");
        this.editorArea = document.getElementById("codeEditorArea");
        this.editorFileNameElem = document.getElementById("editorFileName");

        this.init();
    }

    init() {
        document.getElementById("btnRefreshFiles")?.addEventListener("click", () => this.refresh());
        document.getElementById("btnNewFile")?.addEventListener("click", () => this.createNewFilePrompt());
        document.getElementById("btnNewFolder")?.addEventListener("click", () => this.createNewFolderPrompt());
        document.getElementById("btnExportZip")?.addEventListener("click", () => this.exportZip());
        
        document.getElementById("btnSaveEditor")?.addEventListener("click", () => this.saveCurrentFile());
        document.getElementById("btnCloseEditor")?.addEventListener("click", () => this.closeEditor());

        // Programming symbol chips
        document.querySelectorAll(".code-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                this.insertSymbol(chip.innerText);
            });
        });
    }

    setPath(path) {
        this.currentPath = path;
        if (this.pathDisplayElem) {
            this.pathDisplayElem.innerText = path;
        }
        this.refresh();
    }

    refresh() {
        if (!this.filesListElem) return;
        this.filesListElem.innerHTML = `<div class="loading-state">Чтение файлов...</div>`;

        if (!window.AntigravityBridge) {
            this.filesListElem.innerHTML = `<div class="loading-state">[Bridge недоступен]</div>`;
            return;
        }

        try {
            const raw = window.AntigravityBridge.listFiles(this.currentPath);
            const items = JSON.parse(raw);

            if (!items || items.length === 0) {
                this.filesListElem.innerHTML = `
                    <div style="padding: 24px; text-align: center; color: var(--text-secondary);">
                        Папка пуста. Агент создаст файлы здесь или нажмите «➕ Файл».
                    </div>
                `;
                return;
            }

            // Sort: directories first, then alphabetical
            items.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });

            this.filesListElem.innerHTML = "";

            // Up folder navigation if not root
            if (this.currentPath !== window.appState.workspaceDir) {
                const upItem = document.createElement("div");
                upItem.className = "file-item";
                upItem.innerHTML = `
                    <div class="file-item-left">
                        <span class="file-icon">📁</span>
                        <span class="file-name">.. (На уровень выше)</span>
                    </div>
                `;
                upItem.onclick = () => {
                    const parent = this.currentPath.substring(0, this.currentPath.lastIndexOf("/"));
                    if (parent) this.setPath(parent);
                };
                this.filesListElem.appendChild(upItem);
            }

            items.forEach(item => {
                const el = document.createElement("div");
                el.className = "file-item";
                const icon = item.isDirectory ? "📁" : this.getFileIcon(item.name);
                const sizeText = item.isDirectory ? "Папка" : this.formatSize(item.size);

                el.innerHTML = `
                    <div class="file-item-left">
                        <span class="file-icon">${icon}</span>
                        <span class="file-name">${this.escapeHtml(item.name)}</span>
                    </div>
                    <div class="file-meta">${sizeText}</div>
                `;

                el.onclick = () => {
                    if (item.isDirectory) {
                        this.setPath(item.path);
                    } else {
                        this.openFile(item.path, item.name);
                    }
                };

                this.filesListElem.appendChild(el);
            });

        } catch (e) {
            this.filesListElem.innerHTML = `<div class="loading-state">Ошибка: ${this.escapeHtml(e.message)}</div>`;
        }
    }

    openFile(path, name) {
        if (!window.AntigravityBridge) return;
        try {
            const raw = window.AntigravityBridge.readFile(path, 0, 0);
            const res = JSON.parse(raw);
            if (res.status === "ok") {
                this.currentEditingFile = path;
                this.editorFileNameElem.innerText = name;
                this.editorArea.value = res.content || "";
                this.editorOverlay.style.display = "flex";
            } else {
                alert("Ошибка открытия файла: " + (res.error || "Неизвестная ошибка"));
            }
        } catch (e) {
            alert("Ошибка чтения: " + e.message);
        }
    }

    saveCurrentFile() {
        if (!this.currentEditingFile || !window.AntigravityBridge) return;
        try {
            const content = this.editorArea.value;
            const raw = window.AntigravityBridge.writeFile(this.currentEditingFile, content, true);
            const res = JSON.parse(raw);
            if (res.status === "ok") {
                if (window.AntigravityBridge.vibrate) window.AntigravityBridge.vibrate(30);
                this.showToast("Файл сохранен!");
                this.refresh();
            } else {
                alert("Ошибка сохранения: " + res.error);
            }
        } catch (e) {
            alert("Ошибка сохранения: " + e.message);
        }
    }

    closeEditor() {
        this.editorOverlay.style.display = "none";
        this.currentEditingFile = null;
    }

    insertSymbol(sym) {
        if (!this.editorArea) return;
        const start = this.editorArea.selectionStart;
        const end = this.editorArea.selectionEnd;
        const val = this.editorArea.value;
        this.editorArea.value = val.substring(0, start) + sym + val.substring(end);
        this.editorArea.selectionStart = this.editorArea.selectionEnd = start + sym.length;
        this.editorArea.focus();
    }

    createNewFilePrompt() {
        const name = prompt("Введите имя нового файла (например: main.py):");
        if (!name || !name.trim()) return;

        const path = this.currentPath + "/" + name.trim();
        if (window.AntigravityBridge) {
            window.AntigravityBridge.writeFile(path, "", false);
            this.refresh();
            this.openFile(path, name.trim());
        }
    }

    createNewFolderPrompt() {
        const name = prompt("Введите имя папки:");
        if (!name || !name.trim()) return;

        const path = this.currentPath + "/" + name.trim();
        if (window.AntigravityBridge) {
            window.AntigravityBridge.executeShell("mkdir -p '" + path + "'", this.currentPath);
            this.refresh();
        }
    }

    exportZip() {
        if (window.AntigravityBridge && window.AntigravityBridge.shareProjectZip) {
            window.AntigravityBridge.shareProjectZip(this.currentPath);
        } else {
            alert("Экспорт ZIP доступен только на устройстве Android.");
        }
    }

    getFileIcon(filename) {
        const ext = filename.split(".").pop().toLowerCase();
        switch (ext) {
            case "py": return "🐍";
            case "js": case "ts": return "🟨";
            case "html": return "🌐";
            case "css": return "🎨";
            case "json": return "📋";
            case "md": return "📝";
            case "sh": case "bat": return "⚡";
            case "png": case "jpg": case "svg": return "🖼️";
            default: return "📄";
        }
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    showToast(msg) {
        const t = document.createElement("div");
        t.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: rgba(16, 185, 129, 0.9); color: #fff; padding: 8px 16px;
            border-radius: 20px; font-size: 12px; font-weight: 600; z-index: 9999;
        `;
        t.innerText = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2000);
    }

    escapeHtml(str) {
        return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

window.ProjectManager = ProjectManager;
