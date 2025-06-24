import * as vscode from 'vscode';
import { ContextProvider } from './provider/contextProvider';
import { StatusBarManager } from './ui/statusBarMngt';
import { ContextBridgeServer } from './server/contextBridgeServer';

let contextProvider: ContextProvider | undefined;
let statusBarManager: StatusBarManager | undefined;
let contextBridgeServer: ContextBridgeServer | undefined;

export function activate(contenxt: vscode.ExtensionContext) {
    console.log("VSCode Context Bridge extension is now live!");

    contextProvider = new ContextProvider();
    statusBarManager = new StatusBarManager();

    const startServerCmd = vscode.commands.registerCommand('vscode-context-bridge.startServer', startServer);
    const stopServerCmd = vscode.commands.registerCommand('vscode-context-bridge.stopServer', stopServer);

    const showStatusCmd = vscode.commands.registerCommand('vscode-context-bridge.showStatus', showStatus);

    contenxt.subscriptions.push(startServerCmd, stopServerCmd, showStatusCmd);

    statusBarManager.updateStatus(false)

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
            vscode.window.showInformationMessage("Context Bridge server is already running.");
            return;
        }

        const config = vscode.workspace.getConfiguration('vscodeContextBridge');
        const port = config.get<number>('port', 3000);

        contextBridgeServer = new ContextBridgeServer(port, contextProvider!);
        await contextBridgeServer.start();

        statusBarManager!.updateStatus(true);
        vscode.window.showInformationMessage(`Context Bridge server started on port ${port}.`);
    } catch (error) {
        console.error("Error starting Context Bridge server:", error);
        vscode.window.showErrorMessage(`Failed to start Context Bridge server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}


async function stopServer() {
    try {
        if (!contextBridgeServer || !contextBridgeServer.isRunning()) {
            vscode.window.showInformationMessage('Context Bridge server is not running.');
            return;
        }

        await contextBridgeServer.stop();
        statusBarManager!.updateStatus(false);
        vscode.window.showInformationMessage('Context Bridge server stopped.');
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
    const ignoreFiles = config.get<string[]>('ignoreFiles') ?? [];

    const status = isRunning ? 'Running' : 'Stopped';

    vscode.window.showInformationMessage(
        `Context Bridge Server Status:\n` +
        `Server: ${status}\n` +
        `Port: ${port}\n` +
        `Share Diagnostics: ${shareDiagnostics ? 'Yes' : 'No'}\n` +
        `Ignore Files: ${ignoreFiles.join(', ')}\n` +
        `Share Diffs: ${shareDiffs ? 'Yes' : 'No'}`
    );
} 