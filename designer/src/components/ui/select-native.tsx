import React from 'react'

interface SelectNativeProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode
  error?: boolean
}

/**
 * Native select dropdown with consistent styling
 */
export const SelectNative = React.forwardRef<
  HTMLSelectElement,
  SelectNativeProps
>(({ children, error, className = '', ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={`w-full mt-1 bg-transparent rounded-lg py-2 pl-3 pr-10 border text-foreground appearance-none ${
        error ? 'border-destructive' : 'border-input'
      } ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
        backgroundPosition: 'right 0.75rem center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '1.5em 1.5em',
      }}
      {...props}
    >
      {children}
    </select>
  )
})

SelectNative.displayName = 'SelectNative'

