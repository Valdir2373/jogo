import { useState, useEffect, useRef } from 'react'
import { Button } from './Button'
import { Input } from './Input'

interface ChatMessage {
  id: string
  sender_id: string
  sender_name: string
  text: string
  timestamp: number
}

interface ChatProps {
  roomId: string
  userId: string
  displayName: string
}

function decodeHTML(html: string) {
  const txt = document.createElement('textarea')
  txt.innerHTML = html
  return txt.value
}

export function Chat({ roomId, userId, displayName }: ChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Listen to WebSocket events forwarded via CustomEvents
  useEffect(() => {
    const handleChatEvent = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (data.event === 'chat_history') {
        const payload = data.payload as { messages: ChatMessage[] }
        setMessages(payload.messages)
        if (!isOpen) {
          setUnreadCount(payload.messages.length)
        }
      } else if (data.event === 'chat_message') {
        const msg = data.payload as ChatMessage
        setMessages(prev => {
          // Prevent duplicates (just in case)
          if (prev.some(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        if (!isOpen) {
          setUnreadCount(c => c + 1)
        }
      }
    }

    window.addEventListener('app-global-event', handleChatEvent)
    return () => {
      window.removeEventListener('app-global-event', handleChatEvent)
    }
  }, [isOpen])

  // Scroll to bottom when messages list updates or chat opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const toggleChat = () => {
    if (!isOpen) {
      setUnreadCount(0)
    }
    setIsOpen(!isOpen)
  }

  const handleSend = () => {
    const text = inputText.trim()
    if (!text) return

    const payload = {
      action: 'send_chat',
      room_id: roomId,
      text: text,
      sender_name: displayName,
    }

    // Dispatch custom event to let the active useWebSocket hook send the message
    window.dispatchEvent(new CustomEvent('app-send-chat', { detail: payload }))
    setInputText('')
  }

  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    const hrs = String(date.getHours()).padStart(2, '0')
    const mins = String(date.getMinutes()).padStart(2, '0')
    return `${hrs}:${mins}`
  }

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={toggleChat}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-primary text-white shadow-xl shadow-primary-border/20 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200 border border-primary-border/20 select-none text-xl"
        title="Abrir chat"
      >
        💬
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-zinc-950 flex items-center justify-center text-[10px] font-bold text-white animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Slide-in Chat Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-zinc-950/95 border-l border-zinc-800 shadow-2xl z-50 flex flex-col transition-all duration-300 ease-in-out backdrop-blur-md ${
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
              <span>💬 Chat da Sala</span>
            </h3>
            <p className="text-[10px] text-zinc-500 font-mono tracking-wider">{roomId}</p>
          </div>
          <button
            onClick={toggleChat}
            className="text-zinc-500 hover:text-zinc-300 w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-zinc-800">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-xs text-center p-4">
              <span className="text-2xl mb-1.5">👋</span>
              <p>Nenhuma mensagem ainda.</p>
              <p className="mt-0.5 text-[10px]">Envie um "oi" para começar!</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === userId
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] ${
                    isMe ? 'self-end items-end' : 'self-start items-start'
                  }`}
                >
                  <span className="text-[10px] text-zinc-500 mb-0.5 px-1 truncate max-w-full font-medium">
                    {isMe ? 'você' : decodeHTML(msg.sender_name)}
                  </span>
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm break-words max-w-full shadow-sm leading-relaxed ${
                      isMe
                        ? 'bg-primary text-white rounded-tr-none'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-none'
                    }`}
                  >
                    {decodeHTML(msg.text)}
                  </div>
                  <span className="text-[8px] text-zinc-600 mt-0.5 px-1">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 flex gap-2">
          <Input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleSend()
              }
            }}
            placeholder="Mensagem..."
            className="flex-1 text-xs"
            maxLength={500}
          />
          <Button
            onClick={handleSend}
            className="px-3 py-2 text-xs flex items-center justify-center font-bold"
          >
            ✈️
          </Button>
        </div>
      </div>
    </>
  )
}
