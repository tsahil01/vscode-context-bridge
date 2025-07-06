import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ActiveFileInfo, CommandRequest, CommandResponse, ContextData, DiagnosticInfo, DiffChange, DiffInfo, OpenTabInfo, TextSelectionInfo, ChangeProposal, ChangeProposalRequest, ChangeProposalResponse } from '../types';
import { languageMap } from '../const';

export class ContextProvider extends EventEmitter {
    private config: vscode.WorkspaceConfiguration;
    private changeProposals: Map<string, ChangeProposal> = new Map();

    constructor() {
        super();
        this.config = vscode.workspace.getConfiguration('vscodeContextBridge');
    }

    async getContext(): Promise<ContextData> {
        const activeFile = await this.getActiveFileInfo();
        const textSelection = this.getTextSelectionInfo();
        const openTabs = this.getOpenTabsInfo();
        const diffs = await this.getDiffsInfo();
        const diagnostics = await this.getDiagnosticsInfo();

        const context: ContextData = {
            activeFile,
            textSelection,
            openTabs,
            diffs: diffs === null ? null : diffs,
            diagnostics: diagnostics === null ? null : diagnostics,
            timestamp: Date.now()
        };
        return context;
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
            case 'proposeChange':
                return await this.proposeChange(args[0]);
            case 'acceptProposal':
                return await this.acceptProposal(args[0]);
            case 'rejectProposal':
                return await this.rejectProposal(args[0]);
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
        const ignoreFiles = this.config.get<string[]>('ignoreFiles') ?? [];
        const filePath = activeEditor.document.fileName;
        if (ignoreFiles.some(pattern => filePath.toLowerCase().includes(pattern.trim().toLowerCase()))) {
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
        const ignoreFiles = this.config.get<string[]>('ignoreFiles') ?? [];
        const filePath = activeEditor.document.fileName;
        if (ignoreFiles.some(pattern => filePath.includes(pattern))) {
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
        const ignoreFiles = this.config.get<string[]>('ignoreFiles') ?? [];
        vscode.window.tabGroups.all.forEach(grp => {
            grp.tabs.forEach(tab => {
                if (tab.input instanceof vscode.TabInputText) {
                    const document = tab.input.uri;
                    const filePath = document.fsPath;
                    if (ignoreFiles.some(pattern => filePath.includes(pattern))) {
                        return;
                    }
                    openTabs.push({
                        path: filePath,
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

    private async getDiffsInfo(): Promise<DiffInfo[] | null> {
        const shareDiffs = this.config.get<boolean>('shareDiffs', true);
        if (!shareDiffs) {
            return null;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return null;
        }

        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const gitApi = gitExtension?.getAPI(1);

        if (gitApi) {
            const diffs: DiffInfo[] = [];
            for (const repo of gitApi.repositories) {
                for (const change of repo.state.workingTreeChanges) {
                    if ((this.config.get<string[]>('ignoreFiles') ?? []).includes(change.uri.fsPath)) {
                        continue;
                    }
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
            return diffs;
        }
        return null;
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

    private async getDiagnosticsInfo(): Promise<DiagnosticInfo[] | null> {
        const shareDiagnostics = this.config.get<boolean>('shareDiagnostics', true);
        if (!shareDiagnostics) {
            return null;
        }

        const diagnostics: DiagnosticInfo[] = [];
        const diagnosticCollection = vscode.languages.getDiagnostics();

        for (const [uri, diags] of diagnosticCollection) {
            if ((this.config.get<string[]>('ignoreFiles') ?? []).includes(uri.fsPath)) {
                continue;
            }
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

            const context = await this.getContext();
            this.emit('contextChanged', context);

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

            const context = await this.getContext();
            this.emit('contextChanged', context);
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

    private async proposeChange(request: ChangeProposalRequest): Promise<ChangeProposalResponse> {
        try {
            const proposalId = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const proposal: ChangeProposal = {
                id: proposalId,
                title: request.title,
                filePath: request.filePath,
                changes: request.changes,
                timestamp: Date.now()
            };

            this.changeProposals.set(proposalId, proposal);
            
            const result = await this.showInlineDiffAndWait(proposal);
            
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: 'Failed to create change proposal',
                accepted: false
            };
        }
    }

    private async acceptProposal(proposalId: string): Promise<ChangeProposalResponse> {
        try {
            const proposal = this.changeProposals.get(proposalId);
            if (!proposal) {
                return {
                    success: false,
                    error: 'Proposal not found',
                    message: `Proposal ${proposalId} not found`,
                    accepted: false
                };
            }

            const uri = vscode.Uri.file(proposal.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const edit = new vscode.WorkspaceEdit();

            const sortedChanges = [...proposal.changes]
                .map(change => ({
                    ...change,
                    startLine: change.startLine - 1, // Convert to 0-based
                    endLine: change.endLine - 1      // Convert to 0-based
                }))
                .sort((a, b) => b.startLine - a.startLine);
            
            for (const change of sortedChanges) {
                if (change.startLine < 0 || change.endLine < 0) {
                    throw new Error(`Invalid line numbers: startLine=${change.startLine + 1}, endLine=${change.endLine + 1} (1-based)`);
                }
                if (change.startLine > change.endLine) {
                    throw new Error(`startLine (${change.startLine + 1}) cannot be greater than endLine (${change.endLine + 1}) (1-based)`);
                }
                if (change.endLine >= document.lineCount) {
                    throw new Error(`endLine (${change.endLine + 1}) exceeds document line count (${document.lineCount}) (1-based)`);
                }

                const startPosition = new vscode.Position(change.startLine, 0);
                const endPosition = new vscode.Position(change.endLine + 1, 0);
                edit.replace(uri, new vscode.Range(startPosition, endPosition), change.proposedContent + '\n');
            }

            await vscode.workspace.applyEdit(edit);
            await document.save();

            this.changeProposals.delete(proposalId);

            return {
                success: true,
                data: { proposalId, filePath: proposal.filePath },
                message: `Change proposal ${proposalId} accepted and applied`,
                accepted: true
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: `Failed to accept proposal ${proposalId}`,
                accepted: false
            };
        }
    }

    private async rejectProposal(proposalId: string): Promise<ChangeProposalResponse> {
        try {
            const proposal = this.changeProposals.get(proposalId);
            if (!proposal) {
                return {
                    success: false,
                    error: 'Proposal not found',
                    message: `Proposal ${proposalId} not found`,
                    accepted: false
                };
            }

            this.changeProposals.delete(proposalId);

            return {
                success: true,
                data: { proposalId },
                message: `Change proposal ${proposalId} rejected`,
                accepted: false
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: `Failed to reject proposal ${proposalId}`,
                accepted: false
            };
        }
    }

        private async showInlineDiffAndWait(proposal: ChangeProposal): Promise<ChangeProposalResponse> {
        let tempOriginalUri: vscode.Uri | undefined;
        let tempProposedUri: vscode.Uri | undefined;
        
        try {
            const uri = vscode.Uri.file(proposal.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const originalContent = document.getText();
            
            let proposedContent = originalContent;
            
            const sortedChanges = [...proposal.changes]
                .map(change => ({
                    ...change,
                    startLine: change.startLine - 1,
                    endLine: change.endLine - 1
                }))
                .sort((a, b) => b.startLine - a.startLine);
            
            const lines = originalContent.split('\n');
            
            for (const change of sortedChanges) {
                if (change.startLine < 0 || change.endLine < 0 || 
                    change.startLine > change.endLine || 
                    change.endLine >= lines.length) {
                    continue;
                }
                
                const beforeLines = lines.slice(0, change.startLine);
                const afterLines = lines.slice(change.endLine + 1);
                const newLines = change.proposedContent.split('\n');
                
                lines.splice(0, lines.length, ...beforeLines, ...newLines, ...afterLines);
            }
            
            proposedContent = lines.join('\n');

            const fileName = proposal.filePath.split('/').pop() || proposal.filePath.split('\\').pop() || 'file';
            const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            
            const vscodeFolder = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
            await vscode.workspace.fs.createDirectory(vscodeFolder);
            
            tempOriginalUri = vscode.Uri.joinPath(vscodeFolder, `${fileName}.original.${ext}`);
            tempProposedUri = vscode.Uri.joinPath(vscodeFolder, `${fileName}.proposed.${ext}`);
            
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(tempOriginalUri, encoder.encode(originalContent));
            await vscode.workspace.fs.writeFile(tempProposedUri, encoder.encode(proposedContent));
            
            await vscode.commands.executeCommand('vscode.diff',
                tempOriginalUri,
                tempProposedUri,
                `${proposal.title} - Review Changes`
            );
            
            const changeCount = proposal.changes.length;
            const action = await vscode.window.showInformationMessage(
                `${proposal.title} - Review ${changeCount} change(s)`,
                { modal: false },
                { title: 'Accept Changes', isCloseAffordance: false },
                { title: 'Reject Changes', isCloseAffordance: true }
            );
            
            try {
                if (tempOriginalUri) {
                    await vscode.workspace.fs.delete(tempOriginalUri);
                }
                if (tempProposedUri) {
                    await vscode.workspace.fs.delete(tempProposedUri);
                }
            } catch (e) {
                console.warn('Failed to clean up temp files:', e);
            }
            
            if (!action) {
                this.changeProposals.delete(proposal.id);
                return {
                    success: false,
                    error: 'No action selected',
                    message: `Change proposal ${proposal.id} was dismissed`,
                    accepted: false
                };
            }
            
            if (action.title === 'Accept Changes') {
                const result = await this.acceptProposal(proposal.id);
                vscode.window.showInformationMessage('Changes accepted and applied!');
                return result;
            } else {
                const result = await this.rejectProposal(proposal.id);
                vscode.window.showInformationMessage('Changes rejected.');
                return result;
            }

        } catch (error) {
            try {
                if (tempOriginalUri) {
                    await vscode.workspace.fs.delete(tempOriginalUri);
                }
                if (tempProposedUri) {
                    await vscode.workspace.fs.delete(tempProposedUri);
                }
            } catch (e) {
                console.warn('Failed to clean up temp files:', e);
            }
            
            console.error('Failed to show diff:', error);
            vscode.window.showErrorMessage('Failed to show change proposal diff');
            this.changeProposals.delete(proposal.id);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                message: 'Failed to show change proposal',
                accepted: false
            };
        }
    }

}