import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base = 'px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed'

  const variants = {
    primary:   'bg-primary text-white hover:opacity-90 shadow-lg shadow-primary-border/40',
    secondary: 'bg-zinc-900 text-primary-accent border border-primary-border hover:border-primary hover:text-primary-accent',
    ghost:     'text-zinc-400 hover:text-primary-accent hover:bg-zinc-900',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
