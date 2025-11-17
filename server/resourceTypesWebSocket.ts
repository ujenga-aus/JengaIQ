import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface ResourceTypesClient {
  ws: WebSocket;
  companyId: string | null;
}

class ResourceTypesWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ResourceTypesClient> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/resource-types'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: ResourceTypesClient = {
        ws,
        companyId: null
      };
      
      this.clients.set(clientId, client);
      console.log(`[WS ResourceTypes] Client ${clientId} connected. Total clients: ${this.clients.size}`);

      // Handle client messages (subscription to company)
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'subscribe' && data.companyId) {
            client.companyId = data.companyId;
            console.log(`[WS ResourceTypes] Client ${clientId} subscribed to company ${data.companyId}`);
            
            ws.send(JSON.stringify({
              type: 'subscribed',
              companyId: data.companyId
            }));
          }
          
          if (data.type === 'unsubscribe') {
            client.companyId = null;
            console.log(`[WS ResourceTypes] Client ${clientId} unsubscribed`);
          }
        } catch (error) {
          console.error('[WS ResourceTypes] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[WS ResourceTypes] Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error(`[WS ResourceTypes] Client ${clientId} error:`, error);
        this.clients.delete(clientId);
      });
    });

    console.log('[WS ResourceTypes] WebSocket server initialized on /ws/resource-types');
  }

  private generateClientId(): string {
    return `resource_types_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  // Broadcast resource type updates to all clients subscribed to a company
  broadcastToCompany(companyId: string, message: any) {
    const jsonMessage = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.companyId === companyId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(jsonMessage);
        sentCount++;
      }
    });

    console.log(`[WS ResourceTypes] Broadcasted to ${sentCount} clients for company ${companyId}`);
  }

  // Broadcast to all connected clients (for general updates)
  broadcastToAll(message: any) {
    const jsonMessage = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(jsonMessage);
        sentCount++;
      }
    });

    console.log(`[WS ResourceTypes] Broadcasted to ${sentCount} clients`);
  }
}

// Export singleton instance
export const resourceTypesWS = new ResourceTypesWebSocketService();
