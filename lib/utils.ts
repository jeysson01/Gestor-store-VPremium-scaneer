import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSoles(value: number | string) {
  const amount = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(amount)) return 'S/ 0.00'
  return `S/ ${amount.toFixed(2)}`
}

/** Misma presentación que la tabla de compras (es-PE, hora local). */
export function formatPurchaseDate(value: string | Date | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
