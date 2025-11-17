import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface ContractReviewClient {
  ws: WebSocket;
  revisionId: string | null;
  userId: string;
}

interface CellLock {
  cellId: string;
  userId: string;
  clientId: string;
  revisionId: string;
  lockedAt: Date;
}

class ContractReviewWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ContractReviewClient> = new Map();
  private cellLocks: Map<string, CellLock> = new Map(); // key: revisionId:cellId

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/contract-review'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: ContractReviewClient = {
        ws,
        revisionId: null,
        userId: 'anonymous' // Will be updated on first message
      };
      
      this.clients.set(clientId, client);
      console.log(`[WS] Client ${clientId} connected. Total clients: ${this.clients.size}`);

      // Handle client messages (subscription to revisions)
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'subscribe' && data.revisionId) {
            client.revisionId = data.revisionId;
            client.userId = data.userId || 'anonymous';
            console.log(`[WS] Client ${clientId} (${client.userId}) subscribed to revision ${data.revisionId}`);
            
            // Send confirmation with locks for this revision only
            const revisionLocks: CellLock[] = [];
            this.cellLocks.forEach((lock) => {
              if (lock.revisionId === data.revisionId) {
                revisionLocks.push(lock);
              }
            });
            
            ws.send(JSON.stringify({
              type: 'subscribed',
              revisionId: data.revisionId,
              locks: revisionLocks
            }));
          }
          
          if (data.type === 'unsubscribe') {
            // Release all locks held by this client
            this.releaseClientLocks(clientId);
            client.revisionId = null;
            console.log(`[WS] Client ${clientId} unsubscribed`);
          }

          if (data.type === 'lock_cell' && data.cellId) {
            if (!client.revisionId) {
              console.warn(`[WS] Client ${clientId} attempted to lock cell without being subscribed to a revision`);
              return;
            }
            this.lockCell(data.cellId, client.userId, clientId, client.revisionId);
          }

          if (data.type === 'unlock_cell' && data.cellId) {
            if (!client.revisionId) {
              console.warn(`[WS] Client ${clientId} attempted to unlock cell without being subscribed to a revision`);
              return;
            }
            this.unlockCell(data.cellId, clientId, client.revisionId);
          }
        } catch (error) {
          console.error('[WS] Error parsing message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        // Release all locks held by this client
        this.releaseClientLocks(clientId);
        this.clients.delete(clientId);
        console.log(`[WS] Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[WS] Client ${clientId} error:`, error);
        this.clients.delete(clientId);
      });

      // Send heartbeat
      ws.send(JSON.stringify({ type: 'connected' }));
    });
  }

  // Broadcast cell update to all clients subscribed to the revision
  broadcastCellUpdate(revisionId: string, cellUpdate: {
    cellId: string;
    value: string;
    lastEditedBy: string;
    lastEditedAt: string;
    rowId: string;
  }) {
    const message = JSON.stringify({
      type: 'cell_update',
      data: cellUpdate
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.revisionId === revisionId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[WS] Broadcasted cell update to ${sentCount} clients for revision ${revisionId}`);
  }

  // Broadcast revision creation/update
  broadcastRevisionUpdate(projectId: string, revision: any) {
    const message = JSON.stringify({
      type: 'revision_update',
      data: revision
    });

    // Broadcast to all clients (they'll check if they care about this project)
    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[WS] Broadcasted revision update to ${sentCount} clients for project ${projectId}`);
  }

  // Broadcast approval update to all clients subscribed to the revision
  broadcastApprovalUpdate(revisionId: string, approvalUpdate: {
    rowId: string;
    action: 'created' | 'updated' | 'deleted';
    approval?: any;
  }) {
    const message = JSON.stringify({
      type: 'approval_update',
      revisionId,
      data: approvalUpdate
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.revisionId === revisionId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });

    console.log(`[WS] Broadcasted approval ${approvalUpdate.action} to ${sentCount} clients for revision ${revisionId}`);
  }

  private lockCell(cellId: string, userId: string, clientId: string, revisionId: string) {
    // Use revision-scoped key
    const lockKey = `${revisionId}:${cellId}`;
    
    // Check if cell is already locked by someone else in this revision
    const existingLock = this.cellLocks.get(lockKey);
    if (existingLock && existingLock.clientId !== clientId) {
      // Cell is locked by another user - send rejection
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'lock_rejected',
          cellId,
          lockedBy: existingLock.userId
        }));
      }
      return;
    }

    // Lock the cell
    const lock: CellLock = {
      cellId,
      userId,
      clientId,
      revisionId,
      lockedAt: new Date()
    };
    this.cellLocks.set(lockKey, lock);

    // Broadcast lock to other clients on same revision
    const message = JSON.stringify({
      type: 'cell_locked',
      cellId,
      userId
    });

    this.clients.forEach((client) => {
      if (client.revisionId === revisionId && client.ws.readyState === WebSocket.OPEN && this.getClientId(client) !== clientId) {
        client.ws.send(message);
      }
    });

    console.log(`[WS] Cell ${cellId} locked by user ${userId} in revision ${revisionId}`);
  }

  private unlockCell(cellId: string, clientId: string, revisionId: string) {
    // Use revision-scoped key
    const lockKey = `${revisionId}:${cellId}`;
    
    const lock = this.cellLocks.get(lockKey);
    if (!lock || lock.clientId !== clientId) {
      return; // Not locked by this client
    }

    this.cellLocks.delete(lockKey);

    // Broadcast unlock to other clients on same revision
    const message = JSON.stringify({
      type: 'cell_unlocked',
      cellId
    });

    this.clients.forEach((otherClient) => {
      if (otherClient.revisionId === revisionId && otherClient.ws.readyState === WebSocket.OPEN && this.getClientId(otherClient) !== clientId) {
        otherClient.ws.send(message);
      }
    });

    console.log(`[WS] Cell ${cellId} unlocked in revision ${revisionId}`);
  }

  private releaseClientLocks(clientId: string) {
    const client = this.clients.get(clientId);
    const revisionId = client?.revisionId;

    // Find and release all locks held by this client
    const locksToRelease: { lockKey: string; cellId: string; revisionId: string }[] = [];
    this.cellLocks.forEach((lock, lockKey) => {
      if (lock.clientId === clientId) {
        locksToRelease.push({ lockKey, cellId: lock.cellId, revisionId: lock.revisionId });
      }
    });

    locksToRelease.forEach(({ lockKey, cellId, revisionId: lockRevisionId }) => {
      this.cellLocks.delete(lockKey);

      // Broadcast unlock to clients on the same revision
      const message = JSON.stringify({
        type: 'cell_unlocked',
        cellId
      });

      this.clients.forEach((otherClient) => {
        if (otherClient.revisionId === lockRevisionId && otherClient.ws.readyState === WebSocket.OPEN) {
          otherClient.ws.send(message);
        }
      });
    });

    if (locksToRelease.length > 0) {
      console.log(`[WS] Released ${locksToRelease.length} locks for client ${clientId}`);
    }
  }

  private getClientId(client: ContractReviewClient): string | undefined {
    for (const [id, c] of this.clients.entries()) {
      if (c === client) return id;
    }
    return undefined;
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export const contractReviewWS = new ContractReviewWebSocketService();
