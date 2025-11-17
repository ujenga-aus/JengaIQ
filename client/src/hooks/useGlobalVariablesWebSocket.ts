import { useEffect, useRef, useCallback, useState } from 'react';
import { queryClient } from '@/lib/queryClient';

interface WebSocketMessage {
  type: 'connected' | 'subscribed' | 'global_variable_created' | 'global_variable_updated' | 'global_variable_deleted' | 'global_variables_sorted';
  data?: any;
  projectId?: string;
}

export function useGlobalVariablesWebSocket(projectId: string | null) {
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
    const wsUrl = `${protocol}//${window.location.host}/ws/global-variables`;

    console.log('[GlobalVariablesWS] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[GlobalVariablesWS] Connected to global variables WebSocket');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        if (projectId) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            projectId
          }));
          
          queryClient.prefetchQuery({
            queryKey: ['/api/projects', projectId, 'global-variables']
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[GlobalVariablesWS] Received message:', message);

          if (message.type === 'subscribed') {
            console.log('[GlobalVariablesWS] Subscribed to project', message.projectId);
          }

          if (message.type === 'global_variable_created' || message.type === 'global_variable_updated' || message.type === 'global_variable_deleted' || message.type === 'global_variables_sorted') {
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'global-variables']
            });
            console.log('[GlobalVariablesWS] Invalidated global variables cache for project', projectId);
          }
        } catch (error) {
          console.error('[GlobalVariablesWS] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[GlobalVariablesWS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[GlobalVariablesWS] Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          console.error('[GlobalVariablesWS] Max reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[GlobalVariablesWS] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[GlobalVariablesWS] Error creating WebSocket:', error);
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
