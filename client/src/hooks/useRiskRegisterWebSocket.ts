import { useEffect, useRef, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';

interface UseRiskRegisterWebSocketProps {
  projectId: string | null;
  enabled?: boolean;
}

export function useRiskRegisterWebSocket({ projectId, enabled = true }: UseRiskRegisterWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    console.log('[RiskWS Client] connect() called', { projectId, enabled });
    
    if (!projectId || !enabled) {
      console.log('[RiskWS Client] Skipping connection - no projectId or disabled');
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/risk-register`;

    console.log(`[RiskWS Client] Connecting to ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[RiskWS Client] Connected');
      // Subscribe to project updates
      ws.send(JSON.stringify({
        type: 'subscribe',
        projectId,
        userId: 'current-user', // Can be enhanced with actual user ID later
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[RiskWS Client] Message received:', data.type);

        switch (data.type) {
          case 'subscribed':
            console.log(`[RiskWS Client] Subscribed to project ${data.projectId}`);
            break;

          case 'risk_update':
            console.log(`[RiskWS Client] Risk ${data.action}:`, data.data);
            // Invalidate risks query to trigger refetch
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'risks'],
              exact: false,
            });
            break;

          case 'action_update':
            console.log(`[RiskWS Client] Action ${data.action}:`, data.data);
            // Invalidate actions query
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'risk-actions'],
              exact: false,
            });
            break;

          case 'review_update':
            console.log(`[RiskWS Client] Review ${data.action}:`, data.data);
            // Invalidate reviews query
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'risk-reviews'],
              exact: false,
            });
            break;

          case 'consequence_type_update':
            console.log(`[RiskWS Client] Consequence type ${data.action}:`, data.data);
            // Invalidate consequence types query
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'consequence-types'],
              exact: false,
            });
            break;

          case 'consequence_rating_update':
            console.log(`[RiskWS Client] Consequence rating ${data.action}:`, data.data);
            // Invalidate consequence ratings query
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'consequence-ratings'],
              exact: false,
            });
            break;

          case 'revision_update':
            console.log(`[RiskWS Client] Revision ${data.action}:`, data.data);
            // Invalidate revisions query
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId, 'risk-revisions'],
              exact: false,
            });
            break;

          case 'settings_update':
            console.log(`[RiskWS Client] Settings update (${data.settingsType}):`, data.data);
            // Invalidate settings queries
            queryClient.invalidateQueries({
              queryKey: ['/api/projects', projectId],
              exact: false,
            });
            break;

          case 'connected':
            console.log('[RiskWS Client] Connection acknowledged');
            break;

          default:
            console.log('[RiskWS Client] Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('[RiskWS Client] Error processing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[RiskWS Client] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[RiskWS Client] Connection closed');
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds
      if (enabled && projectId) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[RiskWS Client] Attempting to reconnect...');
          connect();
        }, 3000);
      }
    };
  }, [projectId, enabled]);

  useEffect(() => {
    connect();

    return () => {
      // Cleanup
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    connected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
