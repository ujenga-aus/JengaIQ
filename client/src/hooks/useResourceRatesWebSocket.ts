import { useEffect, useRef, useCallback, useState } from 'react';
import { queryClient } from '@/lib/queryClient';

interface WebSocketMessage {
  type: 'connected' | 'subscribed' | 'resource_rate_created' | 'resource_rate_updated' | 'resource_rate_deleted';
  data?: any;
  projectId?: string;
}

export function useResourceRatesWebSocket(projectId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!projectId || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/resource-rates`;

    console.log('[ResourceRatesWS] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ResourceRatesWS] Connected to resource rates WebSocket');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        if (projectId) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            projectId
          }));
          
          queryClient.prefetchQuery({
            queryKey: ['/api/projects', projectId, 'resource-rates']
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[ResourceRatesWS] Received message:', message);

          if (message.type === 'subscribed') {
            console.log('[ResourceRatesWS] Subscribed to project', message.projectId);
          }

          if (message.type === 'resource_rate_created' || message.type === 'resource_rate_updated' || message.type === 'resource_rate_deleted') {
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'resource-rates']
            });
            console.log('[ResourceRatesWS] Invalidated resource rates cache for project', projectId);
          }
        } catch (error) {
          console.error('[ResourceRatesWS] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[ResourceRatesWS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[ResourceRatesWS] Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          console.error('[ResourceRatesWS] Max reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[ResourceRatesWS] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[ResourceRatesWS] Error creating WebSocket:', error);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
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
  }, [connect, projectId]);

  return { isConnected };
}
