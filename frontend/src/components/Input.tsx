import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-zinc-400">{label}</label>
      )}
      <input
        className={`px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-primary focus:outline-none text-white placeholder-zinc-600 transition-colors ${className}`}
        {...props}
      />
    </div>
  )
}
