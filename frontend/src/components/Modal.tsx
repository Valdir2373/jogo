import React from 'react'

interface ModalProps {
  title: string
  children: React.ReactNode
  onClose?: () => void
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-primary-border/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-primary">{title}</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-primary-accent text-2xl leading-none transition-colors"
            >
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
