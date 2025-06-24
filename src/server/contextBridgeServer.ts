import express, { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import { ContextProvider } from '../provider/contextProvider';
import { CommandRequest, CommandResponse, ContextData } from '../types';

export class contextBridgeServer {
    private server: http.Server | undefined;
    private wss: WebSocket.Server | undefined;
    private port: number;
    private contextProvider: ContextProvider
    private serverRunning: boolean = false;
    private app: express.Application;

    constructor(port: number, contextProvider: ContextProvider) {
        this.port = port;
        this.contextProvider = contextProvider;
        this.app = express();
        this.app.use(express.json());
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });
        this.setupRoutes();

         if (typeof (this.contextProvider as any).on === 'function') {
            (this.contextProvider as any).on('contextChanged', (newContext: ContextData) => {
                this.broadcastContextUpdate(newContext);
            });
        }
    }

    private setupRoutes() {
        this.app.get('/context', async (req: Request, res: Response) => {
            try {
                const context = await this.contextProvider.getContext();
                res.status(200).json(context);
            } catch (error) {
                res.status(500).json({ error: 'Failed to get context' });
            }
        });

        this.app.post('/command', async (req: Request, res: Response) => {
            try {
                const commandData: CommandRequest = req.body;
                const response = await this.handleCommandRequest(commandData);
                res.status(200).json(response);
            } catch (error) {
                res.status(400).json({ error: 'Invalid command format' });
            }
        });

        this.app.get('/health', (req: Request, res: Response) => {
            res.status(200).json({ status: 'ok', server: 'running' });
        });

        this.app.use((req: Request, res: Response) => {
            res.status(404).json({ error: 'Not found' });
        });
    }

    async start() {
        return new Promise<void>((resolve, reject) => {
            try {
                this.server = http.createServer(this.app);
                this.wss = new WebSocket.Server({ server: this.server });
                this.wss.on('connection', (ws: WebSocket) => {
                    this.handleWebSocketConnection(ws);
                });
                this.server.listen(this.port, () => {
                    this.serverRunning = true;
                    console.log(`Context Bridge server is running on port ${this.port}`);
                    resolve();
                });
                this.server.on('error', (error: Error) => {
                    console.error(`Error starting server: ${error.message}`);
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        })
    }

    async stop() {
        return new Promise<void>((resolve) => {
            if (this.wss) {
                this.wss.close(() => {
                    console.log('WebSocket server closed');
                });
            }
            if (this.server) {
                this.server.close(() => {
                    this.serverRunning = false;
                    console.log('HTTP server closed');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    isRunning(): boolean {    
        return this.serverRunning;
    }

    private handleWebSocketConnection(ws: WebSocket) {
        console.log('WebSocket client connected');

        ws.on('message', async(message: WebSocket.Data) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === "getContext") {
                    const context = await this.contextProvider.getContext();
                    ws.send(JSON.stringify({ type: 'context', data: context }));
                } else if (data.type === "command") {
                    const res = await this.handleCommandRequest(data.command);
                    ws.send(JSON.stringify({ type: 'commandResponse', data: res }));    
                } else {
                    ws.send(JSON.stringify({ error: 'Unknown message type' }));
                }
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                ws.send(JSON.stringify({ error: 'Invalid msg format' }));
            }
        })
        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
        ws.on('error', (error: Error) => {
            console.error('WebSocket error:', error);
        });
    }
    
    private async handleCommandRequest(commandData: CommandRequest): Promise<CommandResponse> {
        try {
            const result = await this.contextProvider.executeCommand(commandData);
            return {
                success: true,
                data: result,
                message: 'Command executed successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: 'Command execution failed'
            };
        }
    }

    public broadcastContextUpdate(updatedContext: ContextData) {
        if (this.wss) {
            this.wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'context', data: updatedContext }));
                }
            });
        }
    }
} 