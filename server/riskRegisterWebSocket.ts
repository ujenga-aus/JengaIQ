import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface RiskRegisterClient {
  ws: WebSocket;
  projectId: string | null;
  userId: string;
}

class RiskRegisterWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, RiskRegisterClient> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/risk-register'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: RiskRegisterClient = {
        ws,
        projectId: null,
        userId: 'anonymous'
      };
      
      this.clients.set(clientId, client);
      console.log(`[RiskWS] Client ${clientId} connected. Total clients: ${this.clients.size}`);

      // Handle client messages (subscription to projects)
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'subscribe' && data.projectId) {
            client.projectId = data.projectId;
            client.userId = data.userId || 'anonymous';
            console.log(`[RiskWS] Client ${clientId} (${client.userId}) subscribed to project ${data.projectId}`);
            
            // Send confirmation
            ws.send(JSON.stringify({
              type: 'subscribed',
              projectId: data.projectId
            }));
          }
          
          if (data.type === 'unsubscribe') {
            client.projectId = null;
            console.log(`[RiskWS] Client ${clientId} unsubscribed`);
          }
        } catch (error) {
          console.error('[RiskWS] Error parsing message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[RiskWS] Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[RiskWS] Client ${clientId} error:`, error);
        this.clients.delete(clientId);
      });

      // Send heartbeat
      ws.send(JSON.stringify({ type: 'connected' }));
    });
  }

  // Broadcast risk update to all clients subscribed to the project
  broadcastRiskUpdate(projectId: string, action: 'created' | 'updated' | 'deleted', risk: any) {
    const message = JSON.stringify({
      type: 'risk_update',
      action,
      data: risk
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[RiskWS] Broadcasted risk ${action} to ${sentCount} clients for project ${projectId}`);
  }

  // Broadcast action update to all clients subscribed to the project
  broadcastActionUpdate(projectId: string, action: 'created' | 'updated' | 'deleted', actionData: any) {
    const message = JSON.stringify({
      type: 'action_update',
      action,
      data: actionData
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[RiskWS] Broadcasted action ${action} to ${sentCount} clients for project ${projectId}`);
  }

  // Broadcast review update to all clients subscribed to the project
  broadcastReviewUpdate(projectId: string, action: 'created' | 'updated' | 'deleted', review: any) {
    const message = JSON.stringify({
      type: 'review_update',
      action,
      data: review
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[RiskWS] Broadcasted review ${action} to ${sentCount} clients for project ${projectId}`);
  }

  // Broadcast consequence type update to all clients subscribed to the project
  broadcastConsequenceTypeUpdate(projectId: string, action: 'created' | 'updated' | 'deleted', consequenceType: any) {
    const message = JSON.stringify({
      type: 'consequence_type_update',
      action,
      data: consequenceType
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[RiskWS] Broadcasted consequence type ${action} to ${sentCount} clients for project ${projectId}`);
  }

  // Broadcast consequence rating update to all clients subscribed to the project
  broadcastConsequenceRatingUpdate(projectId: string, action: 'created' | 'updated' | 'deleted', rating: any) {
    const message = JSON.stringify({
      type: 'consequence_rating_update',
      action,
      data: rating
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[RiskWS] Broadcasted consequence rating ${action} to ${sentCount} clients for project ${projectId}`);
  }

  // Broadcast revision update to all clients subscribed to the project
  broadcastRevisionUpdate(projectId: string, action: 'created' | 'updated' | 'deleted', revision: any) {
    const message = JSON.stringify({
      type: 'revision_update',
      action,
      data: revision
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[RiskWS] Broadcasted revision ${action} to ${sentCount} clients for project ${projectId}`);
  }

  // Broadcast settings update to all clients subscribed to the project
  broadcastSettingsUpdate(projectId: string, settingsType: string, settings: any) {
    const message = JSON.stringify({
      type: 'settings_update',
      settingsType,
      data: settings
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[RiskWS] Broadcasted settings update (${settingsType}) to ${sentCount} clients for project ${projectId}`);
  }

  private generateClientId(): string {
    return `risk_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export const riskRegisterWS = new RiskRegisterWebSocketService();
