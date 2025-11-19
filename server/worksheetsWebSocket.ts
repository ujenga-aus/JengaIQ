import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface WorksheetsClient {
  ws: WebSocket;
  projectId: string | null;
}

class WorksheetsWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WorksheetsClient> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/worksheets'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: WorksheetsClient = {
        ws,
        projectId: null
      };
      
      this.clients.set(clientId, client);
      console.log(`[WorksheetsWS] Client ${clientId} connected. Total clients: ${this.clients.size}`);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'subscribe' && data.projectId) {
            client.projectId = data.projectId;
            console.log(`[WorksheetsWS] Client ${clientId} subscribed to project ${data.projectId}`);
            
            ws.send(JSON.stringify({
              type: 'subscribed',
              projectId: data.projectId
            }));
          }
          
          if (data.type === 'unsubscribe') {
            client.projectId = null;
            console.log(`[WorksheetsWS] Client ${clientId} unsubscribed`);
          }
        } catch (error) {
          console.error('[WorksheetsWS] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[WorksheetsWS] Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error(`[WorksheetsWS] Client ${clientId} error:`, error);
        this.clients.delete(clientId);
      });
    });

    console.log('[WorksheetsWS] WebSocket server initialized on /ws/worksheets');
  }

  private generateClientId(): string {
    return `worksheets_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  broadcastToProject(projectId: string, message: any) {
    const jsonMessage = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(jsonMessage);
        sentCount++;
      }
    });

    console.log(`[WorksheetsWS] Broadcasted to ${sentCount} clients for project ${projectId}`);
  }
}

export const worksheetsWS = new WorksheetsWebSocketService();
