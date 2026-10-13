import * as React from 'react'
import { Input, type InputProps } from '@/components/ui/input'
import { en } from '@/lib/utils'

/**
 * Numeric input with live thousand separators and Persian digits.
 * `value`/`onChange` always work with plain numbers (no formatting).
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  ...props
}: {
  value: number | '' | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  placeholder?: string
} & Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode'>) {
  const [text, setText] = React.useState(() =>
    value === '' || value == null ? '' : formatGrouped(value),
  )
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) {
      setText(value === '' || value == null ? '' : formatGrouped(value))
    }
  }, [value, focused])

  function handleChange(raw: string) {
    const latin = en(raw).replace(/[^\d]/g, '')
    if (!latin) {
      setText('')
      onChange(null)
      return
    }
    let n = Number(latin)
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setText(formatGrouped(n))
    onChange(n)
  }

  return (
    <Input
      {...props}
      dir="ltr"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => handleChange(e.target.value)}
      className="text-left font-mono"
    />
  )
}

/** 1234567 → «۱٬۲۳۴٬۵۶۷» (Persian digits + thousands separator). */
export function formatGrouped(n: number): string {
  const grouped = Math.trunc(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '٬')
  return toFa(grouped)
}

function toFa(s: string): string {
  return s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}
