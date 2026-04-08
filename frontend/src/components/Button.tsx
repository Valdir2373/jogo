import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base = 'px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-40 disabled:cursor-not-allowed'

  const variants = {
    primary:   'bg-pink-600 text-white hover:bg-pink-500 shadow-lg shadow-pink-900/40',
    secondary: 'bg-zinc-900 text-pink-400 border border-pink-800 hover:border-pink-500 hover:text-pink-300',
    ghost:     'text-zinc-400 hover:text-pink-400 hover:bg-zinc-900',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
