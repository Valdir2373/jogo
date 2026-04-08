import { useEffect, useRef, useCallback } from 'react'

type MessageHandler = (data: Record<string, unknown>) => void

export function useWebSocket(userId: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    const url = `${protocol}://${host}/ws?user_id=${encodeURIComponent(userId)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessageRef.current(data)
      } catch {
        // ignore malformed
      }
    }

    ws.onerror = () => {
      console.error('WebSocket error')
    }

    return () => {
      ws.close()
    }
  }, [userId])

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }, [])

  return { send }
}
