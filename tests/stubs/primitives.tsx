/**
 * Test stub for `@deepseek-ai/dsh-client-ui-primitives` (issue #27).
 *
 * Why a stub: the real package's runtime entry imports its whole atom set at
 * module scope (katex, shiki langs, mdast, anser, diff …). None of those are
 * dependencies of THIS repo — in the browser the module table serves the host's
 * copy, whose own bundle already carries them. Loading the real entry under
 * vitest/jsdom would therefore fail on module resolution, not on our usage.
 *
 * What this stub owes the tests is only the DOM contract the rows rely on:
 * roles, accessible names, checked/selected state, and pass-through of
 * `className` / `disabled` / `title`. Behaviour beyond that (sliding indicator,
 * roving tabindex, focus rings) is verified on the live page via CDP; the type
 * surface is still checked against the real package by `pnpm typecheck`, because
 * the alias here is a Vite (runtime) alias only.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

/** Official Switch contract: a role=switch button with aria-checked. */
export function Switch(props: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string | undefined
  className?: string | undefined
}): React.JSX.Element {
  const { checked, onChange, label, disabled, title, className } = props
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={className}
      onClick={() => { onChange(!checked) }}
    >
      <span aria-hidden="true" />
    </button>
  )
}

/** Official SegmentedControl contract: a tablist of role=tab buttons. */
export function SegmentedControl<Value extends string>(props: {
  id: string
  value: Value
  options: readonly { value: Value; label: string; disabled?: boolean; title?: string }[]
  onChange: (next: Value) => void
  label: string
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  const { id, value, options, onChange, label, disabled, className } = props
  return (
    <div role="tablist" aria-label={label} className={className}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${id}-${option.value}-panel`}
            tabIndex={active ? 0 : -1}
            disabled={disabled === true || option.disabled === true}
            title={option.title}
            onClick={() => { if (!active) onChange(option.value) }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

type StubButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string
  size?: 'md' | 'sm'
  icon?: ReactNode
}

/** Official Button contract: a native button; variant/size are presentation only. */
export const Button = forwardRef<HTMLButtonElement, StubButtonProps>(function Button(props, ref) {
  const { variant, size, icon, children, ...rest } = props
  void variant
  void size
  return (
    <button ref={ref} {...rest} data-icon={icon === undefined ? undefined : 'yes'}>
      {children}
    </button>
  )
})
