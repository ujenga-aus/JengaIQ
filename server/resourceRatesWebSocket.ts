import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface ResourceRatesClient {
  ws: WebSocket;
  projectId: string | null;
}

class ResourceRatesWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ResourceRatesClient> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/resource-rates'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: ResourceRatesClient = {
        ws,
        projectId: null
      };
      
      this.clients.set(clientId, client);
      console.log(`[ResourceRatesWS] Client ${clientId} connected. Total clients: ${this.clients.size}`);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'subscribe' && data.projectId) {
            client.projectId = data.projectId;
            console.log(`[ResourceRatesWS] Client ${clientId} subscribed to project ${data.projectId}`);
            
            ws.send(JSON.stringify({
              type: 'subscribed',
              projectId: data.projectId
            }));
          }
          
          if (data.type === 'unsubscribe') {
            client.projectId = null;
            console.log(`[ResourceRatesWS] Client ${clientId} unsubscribed`);
          }
        } catch (error) {
          console.error('[ResourceRatesWS] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[ResourceRatesWS] Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error(`[ResourceRatesWS] Client ${clientId} error:`, error);
        this.clients.delete(clientId);
      });
    });

    console.log('[ResourceRatesWS] WebSocket server initialized on /ws/resource-rates');
  }

  private generateClientId(): string {
    return `resource_rates_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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

    console.log(`[ResourceRatesWS] Broadcasted to ${sentCount} clients for project ${projectId}`);
  }
}

export const resourceRatesWS = new ResourceRatesWebSocketService();
