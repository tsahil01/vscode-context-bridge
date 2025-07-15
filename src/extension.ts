import * as vscode from 'vscode';
import { ContextProvider } from './provider/contextProvider';
import { StatusBarManager } from './ui/statusBarMngt';
import { ContextBridgeServer } from './server/contextBridgeServer';

let contextProvider: ContextProvider | undefined;
let statusBarManager: StatusBarManager | undefined;
let contextBridgeServer: ContextBridgeServer | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

export function activate(contenxt: vscode.ExtensionContext) {
    console.log("VSCode Context Bridge extension is now live!");

    extensionContext = contenxt;
    contextProvider = new ContextProvider();
    statusBarManager = new StatusBarManager();

    const startServerCmd = vscode.commands.registerCommand('vscode-context-bridge.startServer', startServer);
    const stopServerCmd = vscode.commands.registerCommand('vscode-context-bridge.stopServer', stopServer);

    const showStatusCmd = vscode.commands.registerCommand('vscode-context-bridge.showStatus', showStatus);

    contenxt.subscriptions.push(startServerCmd, stopServerCmd, showStatusCmd);

    const wasRunning = contenxt.globalState.get<boolean>('contextBridgeServerRunning', false);
    statusBarManager.updateStatus(wasRunning);
    if (!contextBridgeServer || !contextBridgeServer.isRunning()) {
        startServer();
    }

    vscode.window.onDidChangeActiveTextEditor(() => {
        contextProvider?.getContext().then(ctx => contextProvider?.emit('contextChanged', ctx));
    });

    vscode.window.onDidChangeTextEditorSelection(() => {
        contextProvider?.getContext().then(ctx => contextProvider?.emit('contextChanged', ctx));
    });

    vscode.workspace.onDidChangeTextDocument(() => {
        contextProvider?.getContext().then(ctx => contextProvider?.emit('contextChanged', ctx));
    });
}

export function deactivate() {
    if (contextBridgeServer) {
        contextBridgeServer.stop();
    }
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}

async function startServer() {
    try {
        if (contextBridgeServer && contextBridgeServer.isRunning()) {
            vscode.window.setStatusBarMessage("Context Bridge server is already running.", 3000);
            return;
        }

        const config = vscode.workspace.getConfiguration('vscodeContextBridge');
        const port = config.get<number>('port', 3000);

        contextBridgeServer = new ContextBridgeServer(port, contextProvider!);
        await contextBridgeServer.start();

        statusBarManager!.updateStatus(true);
        extensionContext?.globalState.update('contextBridgeServerRunning', true);
        vscode.window.setStatusBarMessage(`Context Bridge server started on port ${port}.`, 3000);
    } catch (error) {
        console.error("Error starting Context Bridge server:", error);
        vscode.window.showErrorMessage(`Failed to start Context Bridge server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}


async function stopServer() {
    try {
        if (!contextBridgeServer || !contextBridgeServer.isRunning()) {
            vscode.window.setStatusBarMessage('Context Bridge server is not running.', 3000);
            return;
        }

        await contextBridgeServer.stop();
        statusBarManager!.updateStatus(false);
        extensionContext?.globalState.update('contextBridgeServerRunning', false);
        vscode.window.setStatusBarMessage('Context Bridge server stopped.', 3000);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to stop Context Bridge server: ${error}`);
    }
}

function showStatus() {
    const isRunning = contextBridgeServer?.isRunning() || false;
    const config = vscode.workspace.getConfiguration('vscodeContextBridge');
    const port = config.get<number>('port', 3000);
    const shareDiagnostics = config.get<boolean>('shareDiagnostics', true);
    const shareDiffs = config.get<boolean>('shareDiffs', true);

    async function restartServerIfRunning() {
        if (contextBridgeServer && contextBridgeServer.isRunning()) {
            await stopServer();
            await startServer();
        }
    }

    const menuItems: vscode.QuickPickItem[] = [
        {
            label: isRunning ? '$(debug-stop) Stop Server' : '$(debug-start) Start Server',
            description: isRunning ? 'Stop the Context Bridge server' : 'Start the Context Bridge server',
        },
        {
            label: '$(gear) Configure Port',
            description: `Current: ${port}`,
        },
        {
            label: '$(check) Toggle Share Diagnostics',
            description: `Currently: ${shareDiagnostics ? 'Enabled' : 'Disabled'}`,
        },
        {
            label: '$(diff) Toggle Share Diffs',
            description: `Currently: ${shareDiffs ? 'Enabled' : 'Disabled'}`,
        },
        {
            label: '$(info) Show Current Status',
            description: 'Show the current server and settings status',
        },
    ];

    vscode.window.showQuickPick(menuItems, {
        placeHolder: 'Context Bridge Settings',
        ignoreFocusOut: true,
    }).then(async (selection) => {
        if (!selection) return;
        switch (selection.label) {
            case '$(debug-start) Start Server':
                await vscode.commands.executeCommand('vscode-context-bridge.startServer');
                break;
            case '$(debug-stop) Stop Server':
                await vscode.commands.executeCommand('vscode-context-bridge.stopServer');
                break;
            case '$(gear) Configure Port': {
                const newPort = await vscode.window.showInputBox({
                    prompt: 'Enter new port for Context Bridge server',
                    value: port.toString(),
                    validateInput: (val) => isNaN(Number(val)) || Number(val) <= 0 ? 'Enter a valid port number' : undefined,
                });
                if (newPort) {
                    await config.update('port', Number(newPort), vscode.ConfigurationTarget.Global);
                    vscode.window.setStatusBarMessage(`Port updated to ${newPort}. Restarting server if running...`, 3000);
                    await restartServerIfRunning();
                }
                break;
            }
            case '$(check) Toggle Share Diagnostics': {
                await config.update('shareDiagnostics', !shareDiagnostics, vscode.ConfigurationTarget.Global);
                vscode.window.setStatusBarMessage(`Share Diagnostics ${!shareDiagnostics ? 'enabled' : 'disabled'}. Restarting server if running...`, 3000);
                await restartServerIfRunning();
                break;
            }
            case '$(diff) Toggle Share Diffs': {
                await config.update('shareDiffs', !shareDiffs, vscode.ConfigurationTarget.Global);
                vscode.window.setStatusBarMessage(`Share Diffs ${!shareDiffs ? 'enabled' : 'disabled'}. Restarting server if running...`, 3000);
                await restartServerIfRunning();
                break;
            }
            case '$(info) Show Current Status': {
                const ignoreFiles = config.get<string[]>('ignoreFiles') ?? [];
                const status = isRunning ? 'Running' : 'Stopped';
                vscode.window.setStatusBarMessage(
                    `Context Bridge Server Status: Server: ${status} | Port: ${port} | Share Diagnostics: ${shareDiagnostics ? 'Yes' : 'No'} | Ignore Files: ${ignoreFiles.join(', ')} | Share Diffs: ${shareDiffs ? 'Yes' : 'No'}`,
                    3000
                );
                break;
            }
        }
    });
} 