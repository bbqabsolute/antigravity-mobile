/**
 * Antigravity Mobile - Autonomous Agent Engine
 * Communicates with Gemini API, manages multi-turn history,
 * parses function calls, and executes tools directly on Android device.
 */

class AntigravityAgent {
    constructor() {
        this.history = [];
        this.isRunning = false;
        this.shouldStop = false;
        this.maxIterations = 25;
        this.currentIteration = 0;
        
        // Listeners
        this.onStatusChange = null;
        this.onMessageUpdate = null;
        this.onToolStart = null;
        this.onToolEnd = null;
    }

    getSystemPrompt(workspaceDir) {
        return `You are Antigravity, an advanced autonomous AI coding assistant running directly on an Android smartphone.
Operating System: Android (Linux kernel).
Workspace Directory: ${workspaceDir}

You have full authority to inspect, create, modify, and build code directly on this Android device using your tools.
Available Tools:
1. run_command: Run shell commands via /system/bin/sh on the phone. Use for git, python, file inspection, compiling, running scripts, checking environment.
2. view_file: View contents of files in the workspace.
3. write_to_file: Create or overwrite files in the workspace.
4. replace_file_content: Perform surgical string replacement in existing files.
5. list_directory: List files and subfolders.
6. search_code: Search for patterns or code across files.

Guidelines:
- Work autonomously: think step-by-step, plan, inspect files, implement code, and verify your results.
- When creating projects, write clean, production-ready code.
- If a command fails, inspect the error and automatically try an alternative solution.
- Communicate with the user in the language they used (Russian or English).`;
    }

    getToolDeclarations() {
        return [
            {
                name: "run_command",
                description: "Execute a shell command on the Android device via /system/bin/sh.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        command: { type: "STRING", description: "The exact shell command line string to execute." },
                        cwd: { type: "STRING", description: "Optional working directory. Defaults to workspace root." }
                    },
                    required: ["command"]
                }
            },
            {
                name: "view_file",
                description: "Read the contents of a file in the workspace.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        path: { type: "STRING", description: "Relative or absolute path to the file." },
                        start_line: { type: "INTEGER", description: "Optional 1-indexed start line." },
                        end_line: { type: "INTEGER", description: "Optional 1-indexed end line." }
                    },
                    required: ["path"]
                }
            },
            {
                name: "write_to_file",
                description: "Create or overwrite a file with given content in the workspace.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        path: { type: "STRING", description: "Relative or absolute path to the target file." },
                        content: { type: "STRING", description: "The exact text content to write." },
                        overwrite: { type: "BOOLEAN", description: "Whether to overwrite if file already exists. Default is true." }
                    },
                    required: ["path", "content"]
                }
            },
            {
                name: "replace_file_content",
                description: "Replace exact target string with replacement string in a file.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        path: { type: "STRING", description: "Path to the file." },
                        target: { type: "STRING", description: "Exact string to be replaced." },
                        replacement: { type: "STRING", description: "New replacement string." }
                    },
                    required: ["path", "target", "replacement"]
                }
            },
            {
                name: "list_directory",
                description: "List files and subdirectories in a directory.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        path: { type: "STRING", description: "Directory path to list." }
                    },
                    required: ["path"]
                }
            },
            {
                name: "search_code",
                description: "Search for a text query across files in the workspace.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "Text or pattern to search for." },
                        path: { type: "STRING", description: "Directory path to search in." }
                    },
                    required: ["query"]
                }
            }
        ];
    }

    async runTask(userPrompt, options) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.shouldStop = false;
        this.currentIteration = 0;

        const account = options.account || { isConnected: true, email: "3kgmorkovkii@gmail.com" };
        const apiKey = options.apiKey || (window.AntigravityBridge ? window.AntigravityBridge.getApiKey() : "");
        const model = options.model || "gemini-2.5-flash";
        const workspaceDir = options.workspaceDir;

        // Add user prompt to history
        this.history.push({
            role: "user",
            parts: [{ text: userPrompt }]
        });

        if (this.onStatusChange) {
            this.onStatusChange({ status: "busy", message: "Агент размышляет..." });
        }

        try {
            while (this.isRunning && !this.shouldStop && this.currentIteration < this.maxIterations) {
                this.currentIteration++;
                
                if (this.onStatusChange) {
                    this.onStatusChange({ 
                        status: "busy", 
                        message: `Шаг ${this.currentIteration}: Запрос к ${model}...` 
                    });
                }

                // Prepare request payload
                const requestPayload = {
                    contents: this.history,
                    systemInstruction: {
                        parts: [{ text: this.getSystemPrompt(workspaceDir) }]
                    },
                    tools: [
                        { functionDeclarations: this.getToolDeclarations() }
                    ],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 8192
                    }
                };

                let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                const headers = { "Content-Type": "application/json" };
                if (apiKey) {
                    url += `?key=${apiKey}`;
                } else if (account && account.token) {
                    headers["Authorization"] = `Bearer ${account.token}`;
                }
                
                // Call API via Android Native Bridge to avoid CORS & SSL limitations
                let responseJson;
                if (window.AntigravityBridge) {
                    const respRaw = window.AntigravityBridge.makeHttpRequest(
                        url, 
                        "POST", 
                        JSON.stringify(headers), 
                        JSON.stringify(requestPayload)
                    );
                    const parsedBridge = JSON.parse(respRaw);
                    if (parsedBridge.statusCode !== 200) {
                        let errMsg = "API error " + parsedBridge.statusCode;
                        try {
                            const errBody = JSON.parse(parsedBridge.body);
                            errMsg = errBody.error ? errBody.error.message : errMsg;
                        } catch (e) {}
                        throw new Error(errMsg);
                    }
                    responseJson = JSON.parse(parsedBridge.body);
                } else {
                    // Fallback for browser testing
                    const fetchResp = await fetch(url, {
                        method: "POST",
                        headers: headers,
                        body: JSON.stringify(requestPayload)
                    });
                    if (!fetchResp.ok) {
                        const err = await fetchResp.json();
                        throw new Error(err.error ? err.error.message : fetchResp.statusText);
                    }
                    responseJson = await fetchResp.json();
                }

                if (!responseJson.candidates || responseJson.candidates.length === 0) {
                    throw new Error("Empty response from AI model.");
                }

                const candidate = responseJson.candidates[0];
                const content = candidate.content;
                const parts = content.parts || [];

                // Append model message to history
                this.history.push({
                    role: "model",
                    parts: parts
                });

                // Check for thoughts and text
                let thinkingText = "";
                let responseText = "";
                const functionCalls = [];

                for (const part of parts) {
                    if (part.thought) {
                        thinkingText += part.thought + "\n";
                    }
                    if (part.text) {
                        // Check if model wrapped reasoning in <thought> tags
                        const thoughtMatch = part.text.match(/<thought>([\s\S]*?)<\/thought>/i);
                        if (thoughtMatch) {
                            thinkingText += thoughtMatch[1] + "\n";
                            responseText += part.text.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
                        } else {
                            responseText += part.text;
                        }
                    }
                    if (part.functionCall) {
                        functionCalls.push(part.functionCall);
                    }
                }

                if (this.onMessageUpdate) {
                    this.onMessageUpdate({
                        iteration: this.currentIteration,
                        thinking: thinkingText,
                        text: responseText,
                        hasFunctionCalls: functionCalls.length > 0
                    });
                }

                // If no function calls, agent has completed its response
                if (functionCalls.length === 0) {
                    break;
                }

                // Execute function calls sequentially on Android device
                const functionResponseParts = [];

                for (const call of functionCalls) {
                    if (this.shouldStop) break;

                    const toolName = call.name;
                    const toolArgs = call.args || {};

                    if (this.onToolStart) {
                        this.onToolStart({ name: toolName, args: toolArgs });
                    }
                    if (this.onStatusChange) {
                        this.onStatusChange({ 
                            status: "busy", 
                            message: `Выполняется: ${toolName}...` 
                        });
                    }

                    // Native tool execution
                    const toolResult = await this.executeTool(toolName, toolArgs, workspaceDir);

                    if (this.onToolEnd) {
                        this.onToolEnd({ name: toolName, result: toolResult });
                    }

                    functionResponseParts.push({
                        functionResponse: {
                            name: toolName,
                            response: { result: toolResult }
                        }
                    });
                }

                // Append function responses to history for next model turn
                this.history.push({
                    role: "tool",
                    parts: functionResponseParts
                });
            }

            if (this.currentIteration >= this.maxIterations) {
                if (this.onMessageUpdate) {
                    this.onMessageUpdate({
                        text: "\n\n⚠️ Достигнут лимит итераций автономного выполнения (" + this.maxIterations + "). Нажмите 'Продолжай', если хотите продолжить."
                    });
                }
            }

        } finally {
            this.isRunning = false;
            if (this.onStatusChange) {
                this.onStatusChange({ status: "idle", message: "Готов" });
            }
        }
    }

    async executeTool(name, args, workspaceDir) {
        if (!window.AntigravityBridge) {
            // Termux REST API execution
            try {
                switch (name) {
                    case "run_command": {
                        const resp = await fetch("/api/exec", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ command: args.command, cwd: args.cwd || workspaceDir })
                        });
                        return await resp.json();
                    }
                    case "view_file": {
                        const resp = await fetch(`/api/read?path=${encodeURIComponent(args.path)}`);
                        return await resp.json();
                    }
                    case "write_to_file": {
                        const resp = await fetch("/api/write", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ path: args.path, content: args.content })
                        });
                        return await resp.json();
                    }
                    case "replace_file_content": {
                        const resp = await fetch("/api/replace", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ path: args.path, target: args.target, replacement: args.replacement })
                        });
                        return await resp.json();
                    }
                    case "list_directory": {
                        const resp = await fetch(`/api/files?path=${encodeURIComponent(args.path || workspaceDir)}`);
                        return await resp.json();
                    }
                    case "search_code": {
                        const resp = await fetch("/api/exec", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ command: `grep -rn "${args.query}" .`, cwd: args.path || workspaceDir })
                        });
                        const res = await resp.json();
                        return res.stdout || "No matches found";
                    }
                    default:
                        return { error: "Unknown tool: " + name };
                }
            } catch (e) {
                return { error: "Termux API error: " + e.message };
            }
        }

        try {
            switch (name) {
                case "run_command": {
                    const cwd = args.cwd || workspaceDir;
                    const resStr = window.AntigravityBridge.executeShell(args.command, cwd);
                    return JSON.parse(resStr);
                }
                case "view_file": {
                    const startLine = args.start_line || 0;
                    const endLine = args.end_line || 0;
                    const resStr = window.AntigravityBridge.readFile(args.path, startLine, endLine);
                    return JSON.parse(resStr);
                }
                case "write_to_file": {
                    const overwrite = args.overwrite !== false;
                    const resStr = window.AntigravityBridge.writeFile(args.path, args.content, overwrite);
                    return JSON.parse(resStr);
                }
                case "replace_file_content": {
                    const resStr = window.AntigravityBridge.replaceInFile(args.path, args.target, args.replacement);
                    return JSON.parse(resStr);
                }
                case "list_directory": {
                    const path = args.path || workspaceDir;
                    const resStr = window.AntigravityBridge.listFiles(path);
                    return JSON.parse(resStr);
                }
                case "search_code": {
                    const path = args.path || workspaceDir;
                    const resStr = window.AntigravityBridge.searchCode(path, args.query, false);
                    return JSON.parse(resStr);
                }
                default:
                    return { error: "Unknown tool name: " + name };
            }
        } catch (e) {
            return { error: "Tool execution failed: " + e.message };
        }
    }

    stop() {
        this.shouldStop = true;
        this.isRunning = false;
        if (this.onStatusChange) {
            this.onStatusChange({ status: "idle", message: "Остановлено пользователем" });
        }
    }

    clearHistory() {
        this.history = [];
    }
}

window.AntigravityAgent = AntigravityAgent;
