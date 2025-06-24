const WebSocket = require('ws');
const http = require('http');

class VSCodeContextClient {
    constructor(host = 'localhost', port = 3210) {
        this.host = host;
        this.port = port;
        this.ws = null;
        this.httpBaseUrl = `http://${host}:${port}`;
        this.wsUrl = `ws://${host}:${port}`;
    }

    // HTTP Methods
    async getContext() {
        const options = {
            hostname: this.host,
            port: this.port,
            path: '/context',
            method: 'GET',
        };

        return new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    async executeCommand(command, args = [], options = {}) {
        const postData = JSON.stringify({
            command,
            arguments: args,
            options
        });

        const requestOptions = {
            hostname: this.host,
            port: this.port,
            path: '/command',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Accept': 'application/json'
            }
        };

        return new Promise((resolve, reject) => {
            const req = http.request(requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }

    // WebSocket Methods
    connectWebSocket() {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            console.log('Connected to VS Code Context Bridge');
            // Request initial context on connect
            this.requestContext();
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });

        this.ws.on('close', () => {
            console.log('Disconnected from VS Code Context Bridge');
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'context':
                console.log('Received context update:', message.data);
                break;
            case 'commandResponse':
                console.log('Command response:', message.data);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    requestContext() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'getContext' }));
        }
    }

    sendCommand(command, args = [], options = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'command',
                command: { command, arguments: args, options }
            }));
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Usage 
async function main() {
    const client = new VSCodeContextClient('localhost', 3210);

    // HTTP 
    try {
        console.log('Getting context via HTTP...');
        const context = await client.getContext();
        console.log('Active file:', context.activeFile?.name);
        console.log('Selected text:', context.textSelection?.text);

        // Execute a command
        console.log('Opening a file...');
        const result = await client.executeCommand('openFile', ['/home/sahil/coding/vscode-context-bridge/examples/client.js']);
        console.log('Command result:', result);
    } catch (error) {
        console.error('HTTP request failed:', error);
    }

    // WebSocket 
    client.connectWebSocket();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = VSCodeContextClient;