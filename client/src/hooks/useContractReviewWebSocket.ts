import { useEffect, useRef, useCallback, useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

interface CellUpdate {
  cellId: string;
  value: string;
  lastEditedBy: string;
  lastEditedAt: string;
  rowId: string;
}

interface CellLock {
  cellId: string;
  userId: string;
}

interface WebSocketMessage {
  type: 'connected' | 'subscribed' | 'cell_update' | 'revision_update' | 'approval_update' | 'cell_locked' | 'cell_unlocked' | 'lock_rejected';
  data?: any;
  revisionId?: string;
  projectId?: string;
  cellId?: string;
  userId?: string;
  lockedBy?: string;
  locks?: CellLock[];
}

export function useContractReviewWebSocket(revisionId: string | null, projectId?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const [isConnected, setIsConnected] = useState(false);
  const [lockedCells, setLockedCells] = useState<Map<string, string>>(new Map()); // cellId -> userId
  const { user } = useAuth();

  const connect = useCallback(() => {
    if (!revisionId || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Determine WebSocket protocol based on current page protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/contract-review`;

    console.log('[WS] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to contract review WebSocket');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Subscribe to revision updates
        if (revisionId) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            revisionId,
            userId: user?.givenName || 'anonymous'
          }));
          
          // Ensure rows query is loaded for cache updates
          queryClient.prefetchQuery({
            queryKey: ['/api/contract-review/revisions', revisionId, 'rows']
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WS] Received message:', message);

          if (message.type === 'subscribed') {
            // Initialize locked cells state from server
            if (message.locks && message.locks.length > 0) {
              const locks = new Map<string, string>();
              message.locks.forEach(lock => {
                locks.set(lock.cellId, lock.userId);
              });
              setLockedCells(locks);
              console.log('[WS] Initialized with', locks.size, 'locked cells');
            }
          }

          if (message.type === 'cell_locked' && message.cellId && message.userId) {
            setLockedCells(prev => {
              const next = new Map(prev);
              next.set(message.cellId!, message.userId!);
              return next;
            });
            console.log('[WS] Cell locked:', message.cellId, 'by', message.userId);
          }

          if (message.type === 'cell_unlocked' && message.cellId) {
            setLockedCells(prev => {
              const next = new Map(prev);
              next.delete(message.cellId!);
              return next;
            });
            console.log('[WS] Cell unlocked:', message.cellId);
          }

          if (message.type === 'lock_rejected' && message.cellId && message.lockedBy) {
            console.log('[WS] Lock rejected for cell:', message.cellId, 'locked by', message.lockedBy);
            // Could show a toast notification here
          }

          if (message.type === 'cell_update') {
            const cellUpdate = message.data as CellUpdate;
            const rowsQueryKey = ['/api/contract-review/revisions', revisionId, 'rows'];
            
            // Try to update the cache, but fallback to invalidation if data is missing
            const currentData = queryClient.getQueryData(rowsQueryKey);
            
            if (currentData) {
              queryClient.setQueryData(
                rowsQueryKey,
                (oldData: any[] | undefined) => {
                  if (!oldData) return oldData;
                  
                  return oldData.map(row => {
                    if (row.id === cellUpdate.rowId) {
                      return {
                        ...row,
                        revisionCells: row.revisionCells?.map((cell: any) => 
                          cell.id === cellUpdate.cellId
                            ? {
                                ...cell,
                                value: cellUpdate.value,
                                lastEditedBy: cellUpdate.lastEditedBy,
                                lastEditedAt: cellUpdate.lastEditedAt
                              }
                            : cell
                        )
                      };
                    }
                    return row;
                  });
                }
              );
            } else {
              // If cache is missing, invalidate to trigger a refetch
              console.log('[WS] Cache missing for rows query, invalidating...');
              queryClient.invalidateQueries({ queryKey: rowsQueryKey });
            }
          }

          if (message.type === 'revision_update') {
            // Invalidate revisions list to refresh (include projectId in key)
            if (projectId) {
              queryClient.invalidateQueries({
                queryKey: ['/api/projects', projectId, 'contract-review', 'revisions']
              });
            }
            
            // CRITICAL: Also invalidate rows query to show AI-generated content
            const rowsQueryKey = ['/api/contract-review/revisions', revisionId, 'rows'];
            queryClient.invalidateQueries({ queryKey: rowsQueryKey });
            console.log('[WS] Revision update - invalidated rows query for AI content refresh');
          }

          if (message.type === 'approval_update') {
            // Invalidate rows query to refresh approvals data
            const rowsQueryKey = ['/api/contract-review/revisions', revisionId, 'rows'];
            queryClient.invalidateQueries({ queryKey: rowsQueryKey });
            
            // Also invalidate the specific row's approvals query if it exists
            if (message.data?.rowId) {
              queryClient.invalidateQueries({
                queryKey: ['/api/contract-review/rows', message.data.rowId, 'approvals']
              });
            }
            
            console.log('[WS] Approval update received:', message.data?.action, 'for row', message.data?.rowId);
          }
        } catch (error) {
          console.error('[WS] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('[WS] WebSocket closed');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          console.error('[WS] Max reconnection attempts reached');
        }
      };
    } catch (error) {
      console.error('[WS] Error creating WebSocket:', error);
    }
  }, [revisionId]);

  const lockCell = useCallback((cellId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'lock_cell',
        cellId
      }));
      console.log('[WS] Requesting lock for cell:', cellId);
    }
  }, []);

  const unlockCell = useCallback((cellId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unlock_cell',
        cellId
      }));
      console.log('[WS] Releasing lock for cell:', cellId);
    }
  }, []);

  const isCellLocked = useCallback((cellId: string): boolean => {
    return lockedCells.has(cellId);
  }, [lockedCells]);

  const getCellLockOwner = useCallback((cellId: string): string | undefined => {
    return lockedCells.get(cellId);
  }, [lockedCells]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      // Unsubscribe before closing
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (revisionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [revisionId]);

  return {
    isConnected,
    reconnect: connect,
    lockCell,
    unlockCell,
    isCellLocked,
    getCellLockOwner,
    lockedCells
  };
}
