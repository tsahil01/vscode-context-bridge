import * as vscode from 'vscode';
import { ActiveFileInfo, CommandRequest, OpenTabInfo, TextSelectionInfo } from '../types';
import { languageMap } from '../const';

export class ContextProvider {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('vscodeContextBridge');
    }

    async getContext() {
    }

    async executeCommand(cmd: CommandRequest) {
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

    private getOpenTabsInfo(): OpenTabInfo[]  {
        const openTabs: OpenTabInfo[] = [];

        vscode.window.tabGroups.all.forEach(grp => {
            grp.tabs.forEach(tab => {
                if(tab.input instanceof vscode.TabInputText) {
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

    private async getDiffInfo() {
        
    }



}