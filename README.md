# Context Bridge Extension

```sh
code --install-extension SahilTiwaskar.vscode-context-bridge
```

The extension exposes editor context information via HTTP and WebSocket APIs, allowing external applications to access real-time VS Code editor state. 
This can be useful for building integrations, tools, or services that need to interact with the VS Code editor environment.

## Table of Contents
- [Features](#features)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Building from Source](#building-from-source)
  - [Installing in VS Code](#installing-in-vs-code)
- [Usage](#usage)
- [Starting the Server](#starting-the-server)
- [Configuration](#configuration)
- [Available Commands](#available-commands)

## Features

- **Real-time Updates**: WebSocket support for live context updates
- **Active File Information**: Get details about the currently open and active file
- **Text Selection**: Access currently selected text with position information
- **Open Tabs**: List all files/tabs currently open in the workspace
- **Code Diffs**: Retrieve code changes and modifications in the workspace
- **Diagnostics**: Access linting errors, warnings, and other diagnostics
- **Command Execution**: Send commands to VS Code from external processes
- **Change Proposals**: External tools can propose code changes with accept/reject interface
- **Configurable**: Control what information is shared for privacy

## Installation

### Prerequisites

- Visual Studio Code 1.74.0 or higher
- Node.js 16.0.0 or higher

### Building from Source

1. Clone the repository:
```bash
git clone https://github.com/tsahil01/vscode-context-bridge
cd vscode-context-bridge
```

2. Install dependencies:
```bash
npm install
npm install -g vsce
```

3. Compile the extension:
```bash
npm run compile
```

4. Package the extension (optional):
```bash
npm run vscode:prepublish
```

5. Generate the VSIX file:
```bash
npm run package
```

### Installing in VS Code

1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the command palette
3. Type "Extensions: Install from VSIX" and select it
4. Choose the compiled extension file (if packaged) or use the development version

## Usage

### Starting the Server

1. Open VS Code with a workspace
2. Press `Ctrl+Shift+P` to open the command palette
3. Type `Start Context Bridge Server` and select it
4. The server will start on the configured port (default: 3210)

### Configuration

The extension can be configured through the VS Code settings:
- Open settings (`Ctrl+,` or `Cmd+,` on macOS)
- Search for `Context Bridge` and adjust the things you want to change.
- OR you can change it from the status bar by clicking the `Context Bridge` icon.


## API Reference

### HTTP Endpoints

#### GET /context
Retrieve all context information.

**Response:**
```json
{
    "activeFile": {
        "path": "/path/to/file.ts",
        "name": "file.ts",
        "language": "typescript",
        "content": "file content...",
        "lineCount": 100,
        "isDirty": false
    },
    "textSelection": {
        "text": "selected text",
        "startLine": 10,
        "startCharacter": 5,
        "endLine": 10,
        "endCharacter": 15,
        "range": {
            "start": {"line": 10, "character": 5},
            "end": {"line": 10, "character": 15}
        }
    },
    "openTabs": [
        {
            "path": "/path/to/file.ts",
            "name": "file.ts",
            "language": "typescript",
            "isActive": true,
            "isDirty": false
        }
    ],
    "diffs": [
        {
            "filePath": "/path/to/file.ts",
            "fileName": "file.ts",
            "changes": [
                {
                    "type": "add",
                    "lineNumber": 1,
                    "newText": "added content"
                },
                {
                    "type": "delete",
                    "lineNumber": 2,
                    "originalText": "deleted content"
                },
                {
                    "type": "modify",
                    "lineNumber": 3,
                    "newText": "modified content"
                }
            ]
        }
    ],
    "diagnostics": [
        {
            "filePath": "/path/to/file.ts",
            "fileName": "file.ts",
            "diagnostics": [
                {
                    "message": "Error message",
                    "severity": "error",
                    "range": {
                        "start": {"line": 10, "character": 5},
                        "end": {"line": 10, "character": 15}
                    },
                    "source": "typescript",
                    "code": "TS2304"
                }
            ]
        }
    ],
    "timestamp": 1640995200000
}
```

#### POST /command
Execute a command in VS Code.

**Request:**
```json
{
    "command": "openFile",
    "arguments": ["/path/to/file.ts"],
    "options": {"preview": false}
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "filePath": "/path/to/file.ts"
    },
    "message": "Command executed successfully"
}
```

#### POST /propose-change
Propose a code change that will be shown to the user with accept/reject options.

**Request:**
```json
{
    "title": "Add error handling",
    "filePath": "/path/to/file.js",
    "changes": [
        {
            "originalContent": "function getData() {\n    const data = JSON.parse(response);\n    return data;\n}",
            "proposedContent": "function getData() {\n    try {\n        const data = JSON.parse(response);\n        return data;\n    } catch (error) {\n        console.error('Failed to parse response:', error);\n        return null;\n    }\n}",
            "description": "Add try-catch error handling"
        }
    ]
}
```

**Response:**
```json
{
    "success": true,
    "proposalId": "change_1640995200000_abc123",
    "data": {
        "proposalId": "change_1640995200000_abc123",
        "filePath": "/path/to/file.js"
    },
    "message": "Change proposal change_1640995200000_abc123 accepted and applied",
    "accepted": true
}
```

**Available Commands:**
- `openFile(filePath, options)`: Open a file in editor
- `selectText(startLine, startChar, endLine, endChar)`: Select text in the active editor
- `writeFile(filePath, content)`: Write content to a file
- `deleteFile(filePath)`: Delete a file
- `showNotification(message, type)`: Show a notification (type: 'info', 'warning', 'error')
- `proposeChange(proposalRequest)`: Propose a code change with accept/reject dialog
- `acceptProposal(proposalId)`: Accept a change proposal
- `rejectProposal(proposalId)`: Reject a change proposal

#### GET /health
Health check endpoint.

**Response:**
```json
{
    "status": "ok",
    "server": "running"
}
```

### WebSocket API

Connect to `ws://localhost:3210` for real-time updates.

**Client Message Types:**

1. **Get Context**
```json
{
    "type": "getContext"
}
```

2. **Execute Command**
```json
{
    "type": "command",
    "command": {
        "command": "openFile",
        "arguments": ["/path/to/file.ts"],
        "options": {"preview": false}
    }
}
```

**Server Response Types:**

1. **Context Update**
```json
{
    "type": "context",
    "data": {
        // Same as HTTP /context response
    }
}
```

2. **Command Response**
```json
{
    "type": "commandResponse",
    "data": {
        "success": true,
        "data": {"filePath": "/path/to/file.ts"},
        "message": "Command executed successfully"
    }
}
```

3. **Error Response**
```json
{
    "error": "Invalid msg format"
}
```

**Real-time Updates:**
The WebSocket connection automatically receives context updates when:
- Active file changes
- Text selection changes
- Document content changes

## Node.js Client Example

See [`examples/client.js`](examples/client.js) for a complete Node.js client implementation that demonstrates how to connect to the Context Bridge server via HTTP and WebSocket, and how to use its API.

## Security Considerations

1. **Disable tool**: The extension can be disabled in VS Code settings to prevent unauthorized access over HTTP/WebSocket networks.
2. **Network Access**: The server binds to localhost by default for security
4. **Information Sharing**: Configure what information is shared based on your needs

## Troubleshooting

### Common Issues

1. **Port Already in Use**: Change the port in VS Code settings
3. **Connection Refused**: Ensure the VS Code extension server is running
4. **Permission Denied**: Check file permissions for the workspace

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Support

For issues and feature requests, please use the GitHub issue tracker.
