import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-pink-700">{label}</label>
      )}
      <input
        className={`px-4 py-2.5 rounded-xl border-2 border-pink-200 focus:border-pink-400 focus:outline-none bg-white/80 text-gray-800 placeholder-pink-300 transition-colors ${className}`}
        {...props}
      />
    </div>
  )
}
