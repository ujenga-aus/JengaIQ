import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface GlobalVariablesClient {
  ws: WebSocket;
  projectId: string | null;
}

class GlobalVariablesWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, GlobalVariablesClient> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/global-variables'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: GlobalVariablesClient = {
        ws,
        projectId: null
      };
      
      this.clients.set(clientId, client);
      console.log(`[GlobalVariablesWS] Client ${clientId} connected. Total clients: ${this.clients.size}`);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'subscribe' && data.projectId) {
            client.projectId = data.projectId;
            console.log(`[GlobalVariablesWS] Client ${clientId} subscribed to project ${data.projectId}`);
            
            ws.send(JSON.stringify({
              type: 'subscribed',
              projectId: data.projectId
            }));
          }
          
          if (data.type === 'unsubscribe') {
            client.projectId = null;
            console.log(`[GlobalVariablesWS] Client ${clientId} unsubscribed`);
          }
        } catch (error) {
          console.error('[GlobalVariablesWS] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[GlobalVariablesWS] Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error(`[GlobalVariablesWS] Client ${clientId} error:`, error);
        this.clients.delete(clientId);
      });
    });

    console.log('[GlobalVariablesWS] WebSocket server initialized on /ws/global-variables');
  }

  private generateClientId(): string {
    return `global_variables_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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

    console.log(`[GlobalVariablesWS] Broadcasted to ${sentCount} clients for project ${projectId}`);
  }
}

export const globalVariablesWS = new GlobalVariablesWebSocketService();
