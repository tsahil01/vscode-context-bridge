const WebSocket = require('ws');

class VSCodeContextClient {
    constructor(host = 'localhost', port = 3210) {
        this.host = host;
        this.port = port;
        this.ws = null;
        this.wsUrl = `ws://${host}:${port}`;
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
    client.connectWebSocket();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = VSCodeContextClient;