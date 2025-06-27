export interface CommandRequest {
    command: string;
    arguments?: any[];
    options?: Record<string, any>;
}

export interface ActiveFileInfo {
    path: string;
    name: string;
    language: string;
    content: string;
    lineCount: number;
    isDirty: boolean;
}

export interface TextSelectionInfo {
    startLine: number;
    endLine: number;
    startCharacter: number;
    endCharacter: number;
    text: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface OpenTabInfo {
    path: string;
    name: string;
    language: string;
    isActive: boolean;
    isDirty: boolean;
}

export interface DiffInfo {
    filePath: string;
    fileName: string;
    changes: DiffChange[];
}

export interface DiffChange {
    type: 'add' | 'delete' | 'modify';
    lineNumber: number;
    originalText?: string;
    newText?: string;
}

export interface DiagnosticInfo {
    filePath: string;
    fileName: string;
    diagnostics: Diagnostic[];
}

export interface Diagnostic {
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    source?: string;
    code?: string | number;
}

export interface CommandResponse {
    success: boolean;
    data?: any;
    error?: string;
    message: string;
}

export interface ContextData {
    activeFile: ActiveFileInfo | null;
    textSelection: TextSelectionInfo | null;
    openTabs: OpenTabInfo[];
    diffs: DiffInfo[] | null;
    diagnostics: DiagnosticInfo[] | null;
    timestamp: number;
}

export interface FileChange {
    startLine: number;  
    endLine: number;    
    originalContent: string;
    proposedContent: string;
    description?: string;
}

export interface ChangeProposal {
    id: string;
    title: string;
    description: string;
    filePath: string;
    originalContent?: string;
    proposedContent?: string;
    startLine?: number;  
    endLine?: number;    
    changes?: FileChange[];
    timestamp: number;
}

export interface ChangeProposalRequest {
    title: string;
    description: string;
    filePath: string;
    originalContent?: string;
    proposedContent?: string;
    startLine?: number;  
    endLine?: number;    
    changes?: FileChange[];
}

export interface ChangeProposalResponse {
    success: boolean;
    proposalId?: string;
    data?: any;
    error?: string;
    message: string;
    accepted: boolean;
}
