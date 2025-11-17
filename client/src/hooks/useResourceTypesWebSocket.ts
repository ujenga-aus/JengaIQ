import { useEffect, useRef, useCallback, useState } from 'react';
import { queryClient } from '@/lib/queryClient';

interface WebSocketMessage {
  type: 'connected' | 'subscribed' | 'resource_type_created' | 'resource_type_updated' | 'resource_type_deleted' | 'resource_types_reordered';
  data?: any;
  companyId?: string;
}

export function useResourceTypesWebSocket(companyId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!companyId || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/resource-types`;

    console.log('[ResourceTypesWS] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ResourceTypesWS] Connected to resource types WebSocket');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        if (companyId) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            companyId
          }));
          
          // Prefetch resource types query for cache updates
          queryClient.prefetchQuery({
            queryKey: ['/api/companies', companyId, 'resource-types']
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[ResourceTypesWS] Received message:', message);

          if (message.type === 'subscribed') {
            console.log('[ResourceTypesWS] Subscribed to company', message.companyId);
          }

          if (message.type === 'resource_type_created' || message.type === 'resource_type_updated' || message.type === 'resource_type_deleted' || message.type === 'resource_types_reordered') {
            // Invalidate and refetch resource types for this company
            queryClient.invalidateQueries({
              queryKey: ['/api/companies', companyId, 'resource-types']
            });
            console.log('[ResourceTypesWS] Invalidated resource types cache for company', companyId);
          }
        } catch (error) {
          console.error('[ResourceTypesWS] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[ResourceTypesWS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[ResourceTypesWS] Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          console.error('[ResourceTypesWS] Max reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[ResourceTypesWS] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[ResourceTypesWS] Error creating WebSocket:', error);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, companyId]);

  return { isConnected };
}
