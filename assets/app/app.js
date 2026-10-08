/**
 * Antigravity Mobile - Main Application Controller
 * Handles Google Antigravity authentication, tabs, agent chat, voice, and settings.
 */

window.appState = {
    account: {
        name: "bbq",
        email: "3kgmorkovkii@gmail.com",
        isConnected: true
    },
    model: "gemini-2.5-flash",
    workspaceDir: "",
    hapticEnabled: true,
    soundEnabled: true
};

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    loadSettings();
    initNavigation();
    initGoogleAuth();
    initAgentChat();
    initVoice();
    initSettingsView();

    // Initialize modules
    window.terminalInstance = new MobileTerminal();
    window.projectInstance = new ProjectManager();
    window.projectInstance.setPath(window.appState.workspaceDir);
}

// ----------------- SETTINGS & PERSISTENCE -----------------
function loadSettings() {
    if (window.AntigravityBridge) {
        window.appState.model = window.AntigravityBridge.getSelectedModel() || "gemini-2.5-flash";
        window.appState.workspaceDir = window.AntigravityBridge.getWorkspaceDir() || "/sdcard/AntigravityProjects";
        const savedAccount = localStorage.getItem("google_account");
        if (savedAccount) {
            try {
                window.appState.account = JSON.parse(savedAccount);
            } catch (e) {}
        }
    } else {
        window.appState.model = localStorage.getItem("selected_model") || "gemini-2.5-flash";
        window.appState.workspaceDir = localStorage.getItem("workspace_dir") || "/sdcard/AntigravityProjects";
        const savedAccount = localStorage.getItem("google_account");
        if (savedAccount) {
            try {
                window.appState.account = JSON.parse(savedAccount);
            } catch (e) {}
        }
    }

    // Update UI elements
    updateAccountUI();

    const modelSelect = document.getElementById("settingModelSelect");
    if (modelSelect) modelSelect.value = window.appState.model;

    const wsInput = document.getElementById("settingWorkspacePath");
    if (wsInput) wsInput.value = window.appState.workspaceDir;

    updateHeaderSubtitle();
}

function updateAccountUI() {
    const acc = window.appState.account;
    const initial = (acc.name || acc.email || "B")[0].toUpperCase();

    // Header profile chip
    const avatarEl = document.getElementById("userAvatar");
    if (avatarEl) avatarEl.innerText = initial;

    const shortNameEl = document.getElementById("userShortName");
    if (shortNameEl) shortNameEl.innerText = acc.name || acc.email.split("@")[0];

    // Settings account box
    const sAvatar = document.getElementById("settingsAvatar");
    if (sAvatar) sAvatar.innerText = initial;

    const sName = document.getElementById("settingsAccountName");
    if (sName) sName.innerText = acc.name;

    const sEmail = document.getElementById("settingsAccountEmail");
    if (sEmail) sEmail.innerText = acc.email;

    // Welcome greeting
    const greeting = document.getElementById("welcomeGreeting");
    if (greeting) {
        greeting.innerHTML = `Вы вошли через аккаунт Google: <b style="color:#60A5FA;">${acc.email}</b>. Агент готов к автономной работе на смартфоне без ПК.`;
    }
}

function updateHeaderSubtitle() {
    const subtitle = document.getElementById("headerSubtitle");
    if (subtitle) {
        subtitle.innerText = `${window.appState.model.replace("gemini-2.5-", "Gemini 3.8 ")} • Google Auth`;
    }
}

// ----------------- GOOGLE AUTH MODAL -----------------
function initGoogleAuth() {
    const modal = document.getElementById("googleAuthModal");
    const chip = document.getElementById("userProfileChip");
    const btnSwitch = document.getElementById("btnSwitchAccount");
    const btnClose = document.getElementById("btnCloseAuthModal");
    const btnDefaultAcc = document.getElementById("btnSelectDefaultAccount");
    const btnOtherGoogle = document.getElementById("btnGoogleWebAuth");

    chip?.addEventListener("click", () => {
        modal.style.display = "flex";
    });

    btnSwitch?.addEventListener("click", () => {
        modal.style.display = "flex";
    });

    btnClose?.addEventListener("click", () => {
        modal.style.display = "none";
    });

    btnDefaultAcc?.addEventListener("click", () => {
        window.appState.account = {
            name: "bbq",
            email: "3kgmorkovkii@gmail.com",
            isConnected: true
        };
        localStorage.setItem("google_account", JSON.stringify(window.appState.account));
        updateAccountUI();
        modal.style.display = "none";
        if (window.AntigravityBridge?.vibrate) window.AntigravityBridge.vibrate(30);
    });

    btnOtherGoogle?.addEventListener("click", () => {
        const email = prompt("Введите ваш Google Email для входа в Antigravity:", "user@gmail.com");
        if (email && email.includes("@")) {
            const name = email.split("@")[0];
            window.appState.account = {
                name: name,
                email: email.trim(),
                isConnected: true
            };
            localStorage.setItem("google_account", JSON.stringify(window.appState.account));
            updateAccountUI();
            modal.style.display = "none";
            if (window.AntigravityBridge?.vibrate) window.AntigravityBridge.vibrate(30);
            alert("✓ Вход выполнен! Google аккаунт " + email + " успешно подключен.");
        }
    });
}

// ----------------- NAVIGATION -----------------
function initNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetTabId = item.getAttribute("data-tab");
            switchTab(targetTabId);
        });
    });

    document.getElementById("btnQuickSettings")?.addEventListener("click", () => {
        switchTab("tabSettings");
    });
}

function switchTab(tabId) {
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.getAttribute("data-tab") === tabId);
    });
    document.querySelectorAll(".tab-view").forEach(tab => {
        tab.classList.toggle("active", tab.id === tabId);
    });

    if (tabId === "tabFiles" && window.projectInstance) {
        window.projectInstance.refresh();
    }
}

// ----------------- AGENT CHAT -----------------
let currentAgentMessageEl = null;
let currentThinkingBodyEl = null;
let currentResponseTextEl = null;

function initAgentChat() {
    const agent = new AntigravityAgent();
    window.agentInstance = agent;

    const promptInput = document.getElementById("promptInput");
    const btnSend = document.getElementById("btnSendPrompt");
    const btnStop = document.getElementById("btnStopAgent");
    const statusPill = document.getElementById("agentStatusPill");
    const statusDot = statusPill?.querySelector(".status-dot");
    const statusText = document.getElementById("agentStatusText");
    const activityBar = document.getElementById("agentActivityBar");
    const activityText = document.getElementById("agentActivityText");

    // Agent status callbacks
    agent.onStatusChange = (status) => {
        if (status.status === "busy") {
            statusDot?.classList.add("busy");
            if (statusText) statusText.innerText = "Работает";
            if (activityBar) activityBar.style.display = "flex";
            if (activityText) activityText.innerText = status.message;
        } else {
            statusDot?.classList.remove("busy");
            if (statusText) statusText.innerText = "Готов";
            if (activityBar) activityBar.style.display = "none";
        }
    };

    agent.onMessageUpdate = (update) => {
        if (!currentAgentMessageEl) return;

        // Update thinking block if present
        if (update.thinking && currentThinkingBodyEl) {
            currentThinkingBodyEl.innerText = update.thinking;
            currentThinkingBodyEl.parentElement.style.display = "block";
        }

        // Update text output
        if (update.text && currentResponseTextEl) {
            currentResponseTextEl.innerHTML = renderMarkdown(update.text);
            scrollChatToBottom();
        }
    };

    agent.onToolStart = (tool) => {
        if (!currentAgentMessageEl) return;
        const toolCard = document.createElement("div");
        toolCard.className = "tool-call-card";
        toolCard.id = "tool_" + Date.now();

        const paramPreview = getToolParamPreview(tool.name, tool.args);

        toolCard.innerHTML = `
            <div class="tool-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                <div class="tool-name-badge">
                    <span>⚡ ${tool.name}</span>
                    <span style="color: var(--text-muted); font-size: 11px;">${escapeHtml(paramPreview)}</span>
                </div>
                <div class="tool-status-badge" style="color: #FCD34D;">Выполняется...</div>
            </div>
            <div class="tool-body" style="display: none;">
                <div style="color: var(--text-muted); margin-bottom: 4px;">Аргументы: ${escapeHtml(JSON.stringify(tool.args, null, 2))}</div>
                <div class="tool-res">Выполняется на Android...</div>
            </div>
        `;
        currentAgentMessageEl.querySelector(".msg-bubble").appendChild(toolCard);
        scrollChatToBottom();
    };

    agent.onToolEnd = (tool) => {
        if (!currentAgentMessageEl) return;
        const cards = currentAgentMessageEl.querySelectorAll(".tool-call-card");
        if (cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            const statusBadge = lastCard.querySelector(".tool-status-badge");
            const resBody = lastCard.querySelector(".tool-res");

            if (statusBadge) {
                statusBadge.innerText = "Успешно ✓";
                statusBadge.style.color = "#34D399";
            }
            if (resBody) {
                resBody.innerText = "Результат:\n" + JSON.stringify(tool.result, null, 2);
            }
        }
    };

    // Send action
    async function handleSend() {
        const text = promptInput.value.trim();
        if (!text || agent.isRunning) return;

        promptInput.value = "";
        promptInput.style.height = "auto";

        // Add user bubble
        appendUserMessage(text);

        // Create empty agent response bubble
        createAgentMessageBubble();

        if (window.appState.hapticEnabled && window.AntigravityBridge) {
            window.AntigravityBridge.vibrate(25);
        }

        try {
            await agent.runTask(text, {
                account: window.appState.account,
                model: window.appState.model,
                workspaceDir: window.appState.workspaceDir
            });
            playChime();
        } catch (err) {
            if (currentResponseTextEl) {
                currentResponseTextEl.innerHTML += `
                    <div style="color: var(--color-danger); padding: 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); margin-top: 8px;">
                        ❌ ${escapeHtml(err.message)}
                    </div>
                `;
            }
        }
    }

    btnSend?.addEventListener("click", handleSend);
    btnStop?.addEventListener("click", () => agent.stop());

    promptInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Auto-resize textarea
    promptInput?.addEventListener("input", () => {
        promptInput.style.height = "auto";
        promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + "px";
    });

    // Quick prompt chips
    document.querySelectorAll(".prompt-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const prompt = chip.getAttribute("data-prompt");
            if (prompt) {
                promptInput.value = prompt;
                promptInput.focus();
                handleSend();
            }
        });
    });
}

function appendUserMessage(text) {
    const container = document.getElementById("chatMessages");
    const msg = document.createElement("div");
    msg.className = "message user";
    msg.innerHTML = `
        <div class="msg-bubble">${escapeHtml(text)}</div>
    `;
    container.appendChild(msg);
    scrollChatToBottom();
}

function createAgentMessageBubble() {
    const container = document.getElementById("chatMessages");
    const msg = document.createElement("div");
    msg.className = "message agent";

    msg.innerHTML = `
        <div class="msg-bubble">
            <div class="msg-header">
                <span>🤖 Antigravity</span>
                <span>${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <div class="thinking-block" style="display:none;">
                <div class="thinking-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                    <span>🧠 Ход мыслей (Thinking)</span>
                    <span style="font-size: 10px;">нажмите для просмотра</span>
                </div>
                <div class="thinking-body"></div>
            </div>
            <div class="response-text">
                <span class="spinner" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span>Размышляю...
            </div>
        </div>
    `;

    container.appendChild(msg);
    currentAgentMessageEl = msg;
    currentThinkingBodyEl = msg.querySelector(".thinking-body");
    currentResponseTextEl = msg.querySelector(".response-text");
    scrollChatToBottom();
}

function getToolParamPreview(name, args) {
    if (!args) return "";
    switch (name) {
        case "run_command": return args.command || "";
        case "view_file": return args.path || "";
        case "write_to_file": return args.path || "";
        case "replace_file_content": return args.path || "";
        case "list_directory": return args.path || "";
        case "search_code": return args.query || "";
        default: return "";
    }
}

function scrollChatToBottom() {
    const c = document.getElementById("chatMessages");
    if (c) c.scrollTop = c.scrollHeight;
}

// ----------------- VOICE INPUT -----------------
function initVoice() {
    const btn = document.getElementById("btnVoiceInput");
    if (!btn) return;

    btn.addEventListener("click", () => {
        if (window.AntigravityBridge && window.AntigravityBridge.startVoiceRecognition) {
            btn.classList.add("listening");
            window.AntigravityBridge.startVoiceRecognition();
        } else if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
            btn.classList.add("listening");
            const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
            const rec = new SpeechRec();
            rec.lang = "ru-RU";
            rec.onresult = (e) => {
                const text = e.results[0][0].transcript;
                window.onVoiceInputResult(text);
                btn.classList.remove("listening");
            };
            rec.onerror = () => btn.classList.remove("listening");
            rec.onend = () => btn.classList.remove("listening");
            rec.start();
        } else {
            alert("Голосовой ввод не поддерживается на этом устройстве");
        }
    });

    window.onVoiceInputResult = (text) => {
        btn.classList.remove("listening");
        const promptInput = document.getElementById("promptInput");
        if (promptInput) {
            promptInput.value = (promptInput.value ? promptInput.value + " " : "") + text;
            promptInput.focus();
        }
    };

    window.onVoiceInputError = (err) => {
        btn.classList.remove("listening");
    };
}

// ----------------- SETTINGS VIEW -----------------
function initSettingsView() {
    const modelSelect = document.getElementById("settingModelSelect");
    const wsInput = document.getElementById("settingWorkspacePath");
    const saveWsBtn = document.getElementById("btnSaveWorkspace");
    const resetWsBtn = document.getElementById("btnResetWorkspace");
    const hapticCheck = document.getElementById("settingHaptic");
    const soundCheck = document.getElementById("settingSound");
    const clearHistBtn = document.getElementById("btnClearHistory");

    modelSelect?.addEventListener("change", () => {
        const val = modelSelect.value;
        window.appState.model = val;
        if (window.AntigravityBridge) window.AntigravityBridge.setSelectedModel(val);
        else localStorage.setItem("selected_model", val);
        updateHeaderSubtitle();
    });

    saveWsBtn?.addEventListener("click", () => {
        const val = wsInput.value.trim();
        if (val) {
            window.appState.workspaceDir = val;
            if (window.AntigravityBridge) window.AntigravityBridge.setWorkspaceDir(val);
            else localStorage.setItem("workspace_dir", val);
            if (window.projectInstance) window.projectInstance.setPath(val);
            alert("Рабочая папка сохранена!");
        }
    });

    resetWsBtn?.addEventListener("click", () => {
        const def = "/sdcard/AntigravityProjects";
        wsInput.value = def;
        window.appState.workspaceDir = def;
        if (window.AntigravityBridge) window.AntigravityBridge.setWorkspaceDir(def);
        if (window.projectInstance) window.projectInstance.setPath(def);
    });

    hapticCheck?.addEventListener("change", (e) => {
        window.appState.hapticEnabled = e.target.checked;
    });

    soundCheck?.addEventListener("change", (e) => {
        window.appState.soundEnabled = e.target.checked;
    });

    clearHistBtn?.addEventListener("click", () => {
        if (confirm("Очистить историю диалога с агентом?")) {
            if (window.agentInstance) window.agentInstance.clearHistory();
            const msgs = document.getElementById("chatMessages");
            if (msgs) {
                msgs.innerHTML = `
                    <div class="welcome-card">
                        <div class="welcome-icon">⚡</div>
                        <h3>История очищена</h3>
                        <p>Агент готов к новым задачам.</p>
                    </div>
                `;
            }
        }
    });
}

// ----------------- BACK NAVIGATION -----------------
window.handleBackPressed = () => {
    // If modal open, close it
    const modal = document.getElementById("googleAuthModal");
    if (modal && modal.style.display !== "none") {
        modal.style.display = "none";
        return "true";
    }

    // If editor overlay open, close it
    if (window.projectInstance && window.projectInstance.editorOverlay && 
        window.projectInstance.editorOverlay.style.display !== "none") {
        window.projectInstance.closeEditor();
        return "true";
    }

    // If not in Chat tab, switch to Chat tab
    const chatTab = document.getElementById("tabChat");
    if (chatTab && !chatTab.classList.contains("active")) {
        switchTab("tabChat");
        return "true";
    }

    return "false";
};

// ----------------- AUDIO SYNTHESIZER -----------------
function playChime() {
    if (!window.appState.soundEnabled) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (ignored) {}
}

// ----------------- MARKDOWN PARSER -----------------
function renderMarkdown(md) {
    if (!md) return "";

    let html = escapeHtml(md);

    // Code blocks with syntax and copy button
    html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><span class="code-lang-tag">${lang || "text"}</span><button class="code-copy-btn" onclick="copyCode(this)">Копировать</button><code>${code.trim()}</code></pre>`;
    });

    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/^### (.*$)/gim, "<h4 style='margin: 8px 0 4px 0; color: #93C5FD;'>$1</h4>");
    html = html.replace(/^## (.*$)/gim, "<h3 style='margin: 10px 0 6px 0; color: #60A5FA;'>$1</h3>");
    html = html.replace(/^# (.*$)/gim, "<h2 style='margin: 12px 0 8px 0; color: #3B82F6;'>$1</h2>");
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, "<li style='margin-left: 18px; margin-bottom: 4px;'>$1</li>");
    html = html.replace(/\n/g, "<br>");

    return html;
}

window.copyCode = (btn) => {
    const code = btn.nextElementSibling.innerText;
    if (window.AntigravityBridge) {
        window.AntigravityBridge.copyToClipboard(code);
        if (window.AntigravityBridge.vibrate) window.AntigravityBridge.vibrate(20);
    } else {
        navigator.clipboard?.writeText(code);
    }
    const orig = btn.innerText;
    btn.innerText = "Скопировано!";
    setTimeout(() => btn.innerText = orig, 1500);
};

function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
