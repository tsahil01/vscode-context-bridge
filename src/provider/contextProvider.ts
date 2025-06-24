import * as vscode from 'vscode';
import { ActiveFileInfo, CommandRequest, CommandResponse, ContextData, DiagnosticInfo, DiffChange, DiffInfo, OpenTabInfo, TextSelectionInfo } from '../types';
import { languageMap } from '../const';

export class ContextProvider {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('vscodeContextBridge');
    }

    async getContext(): Promise<ContextData> {
        const activeFile = await this.getActiveFileInfo();
        const textSelection = this.getTextSelectionInfo();
        const openTabs = this.getOpenTabsInfo();
        const diffs = await this.getDiffsInfo();
        const diagnostics = await this.getDiagnosticsInfo();

        return {
            activeFile,
            textSelection,
            openTabs,
            diffs,
            diagnostics,
            timestamp: Date.now()
        };
    }

    async executeCommand(cmd: CommandRequest): Promise<CommandResponse> {
        const { command, arguments: args = [], options = {} } = cmd;
        switch (command) {
            case 'openFile':
                return await this.openFile(args[0], options);
            case 'writeFile':
                return await this.writeFile(args[0], args[1]);
            case 'deleteFile':
                return await this.deleteFile(args[0]);
            case 'selectText':
                return await this.selectText(args[0], args[1], args[2], args[3]);
            case 'showNotification':
                return await this.showNotification(args[0], options.type || 'info');
            default:
                return {
                    success: false,
                    error: `Unknown command: ${command}`,
                    message: `Failed to execute command: ${command}`
                };
        }
    }

    private getLangFromUri(uri: vscode.Uri): string {
        const afterDot = uri.path.split('.').pop()?.toLowerCase();
        return languageMap[afterDot || ''] || 'plaintext';
    }

    private async getActiveFileInfo(): Promise<ActiveFileInfo | null> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }

        const document = activeEditor.document;

        return {
            path: document.fileName,
            name: document.fileName.split('/').pop() || document.fileName.split('\\').pop() || 'unknown',
            language: document.languageId,
            content: document.getText(),
            lineCount: document.lineCount,
            isDirty: document.isDirty,

        }
    }

    private getTextSelectionInfo(): TextSelectionInfo | null {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.selection.isEmpty) {
            return null;
        }

        const selection = activeEditor.selection;

        return {
            startLine: selection.start.line,
            endLine: selection.end.line,
            startCharacter: selection.start.character,
            endCharacter: selection.end.character,
            text: activeEditor.document.getText(selection),
            range: {
                start: { line: selection.start.line, character: selection.start.character },
                end: { line: selection.end.line, character: selection.end.character }
            }
        };
    }

    private getOpenTabsInfo(): OpenTabInfo[] {
        const openTabs: OpenTabInfo[] = [];

        vscode.window.tabGroups.all.forEach(grp => {
            grp.tabs.forEach(tab => {
                if (tab.input instanceof vscode.TabInputText) {
                    const document = tab.input.uri;
                    openTabs.push({
                        path: document.fsPath,
                        name: document.path.split('/').pop() || document.path.split('\\').pop() || 'unknown',
                        language: this.getLangFromUri(document),
                        isActive: tab.isActive,
                        isDirty: tab.isActive || false
                    })
                }
            })
        })

        return openTabs;
    }

    private async getDiffsInfo(): Promise<DiffInfo[]> {
        const diffs: DiffInfo[] = [];
        const shareDiffs = this.config.get<boolean>('shareDiffs', true);
        if (!shareDiffs) {
            return diffs;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return diffs;
        }

        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const gitApi = gitExtension?.getAPI(1);

        if (gitApi) {
            for (const repo of gitApi.repositories) {
                for (const change of repo.state.workingTreeChanges) {
                    const filePath = change.uri.fsPath;
                    const fileName = change.uri.path.split('/').pop() || change.uri.path.split('\\').pop() || 'unknown';
                    let diffText = '';
                    try {
                        diffText = await repo.diffWithHEAD(filePath);
                    } catch (e) {
                        diffs.push({
                            filePath,
                            fileName,
                            changes: [{
                                type: 'modify',
                                lineNumber: 1,
                                newText: 'File has changes (diff unavailable)'
                            }]
                        });
                        continue;
                    }
                    const changes = this.parseGitDiff(diffText);
                    diffs.push({
                        filePath,
                        fileName,
                        changes
                    });
                }
            }
        }
        return diffs;
    }

    private parseGitDiff(diffText: string): DiffChange[] {
        const changes: DiffChange[] = [];
        const lines = diffText.split('\n');
        let lineNumber = 0;
        for (const line of lines) {
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -\d+,?\d* \+(\d+),?/);
                if (match) {
                    lineNumber = parseInt(match[1], 10);
                }
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
                changes.push({
                    type: 'add',
                    lineNumber: lineNumber++,
                    newText: line.substring(1)
                });
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                changes.push({
                    type: 'delete',
                    lineNumber: lineNumber,
                    originalText: line.substring(1)
                });
            } else if (line.startsWith(' ')) {
                lineNumber++;
            }
        }
        return changes;
    }

    private async getDiagnosticsInfo(): Promise<DiagnosticInfo[]> {
        const shareDiagnostics = this.config.get<boolean>('shareDiagnostics', true);
        if (!shareDiagnostics) {
            return [];
        }

        const diagnostics: DiagnosticInfo[] = [];
        const diagnosticCollection = vscode.languages.getDiagnostics();

        for (const [uri, diags] of diagnosticCollection) {
            if (uri.scheme === 'file') {
                const fileDiagnostics = diags.map(diag => ({
                    message: diag.message,
                    severity: (diag.severity === vscode.DiagnosticSeverity.Error ? 'error' :
                        diag.severity === vscode.DiagnosticSeverity.Warning ? 'warning' :
                            diag.severity === vscode.DiagnosticSeverity.Information ? 'info' : 'hint') as 'error' | 'warning' | 'info' | 'hint',
                    range: {
                        start: { line: diag.range.start.line, character: diag.range.start.character },
                        end: { line: diag.range.end.line, character: diag.range.end.character }
                    },
                    source: diag.source,
                    code: typeof diag.code === 'object' ? diag.code.value : diag.code
                }));

                diagnostics.push({
                    filePath: uri.fsPath,
                    fileName: uri.path.split('/').pop() || uri.path.split('\\').pop() || 'untitled',
                    diagnostics: fileDiagnostics
                });
            }
        }

        return diagnostics;
    }

    private async openFile(filePath: string, options: any = {}): Promise<CommandResponse> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, options);

            return {
                success: true,
                data: { filePath },
                message: `File opened successfully: ${filePath}`
            }

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: `Failed to open file: ${filePath}`
            };
        }
    }

    private async writeFile(filePath: string, content: string): Promise<CommandResponse> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, new vscode.Range(0, 0, document.lineCount, 0), content);
            await vscode.workspace.applyEdit(edit);
            await document.save();

            return {
                success: true,
                data: { filePath },
                message: `File written successfully: ${filePath}`
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: `Failed to write file: ${filePath}`
            };
        }
    }

    private async deleteFile(filePath: string): Promise<CommandResponse> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.delete(uri, { useTrash: true });

            return {
                success: true,
                data: { filePath },
                message: `File deleted successfully: ${filePath}`
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: `Failed to delete file: ${filePath}`
            };
        }
    }

    private async selectText(startLine: number, startChar: number, endLine: number, endChar: number): Promise<CommandResponse> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                throw new Error("No active text editor found");
            }
            const startPosition = new vscode.Position(startLine, startChar);
            const endPosition = new vscode.Position(endLine, endChar);
            const selection = new vscode.Selection(startPosition, endPosition);

            activeEditor.selection = selection;
            activeEditor.revealRange(selection);
            return {
                success: true,
                data: { startLine, startChar, endLine, endChar },
                message: "Text selection set successfully"
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: "Failed to set text selection"
            };
        }
    }

    private async showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<CommandResponse> {
        try {
            switch (type) {
                case 'info':
                    vscode.window.showInformationMessage(message);
                    break;
                case 'warning':
                    vscode.window.showWarningMessage(message);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(message);
                    break;
            }
            return {
                success: true,
                data: { message, type },
                message: `Notification shown: ${message}`
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: `Failed to show notification: ${message}`
            };
        }
    }


}