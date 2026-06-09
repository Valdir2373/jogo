import { useEffect, useRef, useCallback } from 'react'

type MessageHandler = (data: Record<string, unknown>) => void

let globalWs: WebSocket | null = null
const listeners = new Set<MessageHandler>()
const pendingMessages: Record<string, unknown>[] = []

export let lastOnlineUsers: { user_id: string; name: string }[] = []

export function sendSharedMessage(payload: Record<string, unknown>, userId: string) {
  const ws = globalWs || getSharedWebSocket(userId)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  } else {
    pendingMessages.push(payload)
  }
}

function getSharedWebSocket(userId: string): WebSocket {
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
    return globalWs
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${protocol}://${window.location.host}/ws?user_id=${encodeURIComponent(userId)}`
  const ws = new WebSocket(url)
  globalWs = ws

  ws.onopen = () => {
    const pending = pendingMessages.splice(0)
    pending.forEach(msg => ws.send(JSON.stringify(msg)))
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      if (data.event === 'online_users') {
        lastOnlineUsers = data.payload.users || []
      }

      // Dispatch global events for app-level handlers
      if (
        data.event === 'chat_message' ||
        data.event === 'chat_history' ||
        data.event === 'online_users' ||
        data.event === 'private_message' ||
        data.event === 'private_history' ||
        data.event === 'invite_received'
      ) {
        window.dispatchEvent(new CustomEvent('app-global-event', { detail: data }))
      }

      listeners.forEach(listener => {
        try {
          listener(data)
        } catch (e) {
          console.error(e)
        }
      })
    } catch {
      // ignore
    }
  }

  ws.onerror = () => console.error('WebSocket error')
  ws.onclose = () => {
    globalWs = null
  }

  return ws
}

export function useWebSocket(userId: string, onMessage: MessageHandler) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    getSharedWebSocket(userId)

    const listener = (data: Record<string, unknown>) => {
      onMessageRef.current(data)
    }

    listeners.add(listener)

    const handleSendChat = (e: Event) => {
      const payload = (e as CustomEvent).detail
      sendSharedMessage(payload, userId)
    }
    window.addEventListener('app-send-chat', handleSendChat)

    return () => {
      listeners.delete(listener)
      window.removeEventListener('app-send-chat', handleSendChat)
    }
  }, [userId])

  const send = useCallback((payload: Record<string, unknown>) => {
    sendSharedMessage(payload, userId)
  }, [userId])

  return { send }
}
