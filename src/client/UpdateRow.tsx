/**
 * Update-check settings row — one General-section preference row that asks
 * the Host's `/catppuccin/check-update` route for the latest published npm
 * version and reports whether this install is current. Detection is Host-side
 * (Node fetch, no CORS, profile probe included); the row renders the verdict
 * and, when an update is available, offers the copyable CLI upgrade command
 * whose profile name the Host already probed. Upgrading itself stays a
 * terminal action (`dsh plugin … add @latest`) — the row never touches the
 * profile workspace.
 */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UpdateCheckPayload, UpdateErrorCode } from '../update-check.ts'
import type { CatppuccinKey } from './locales.ts'

/** Injected business face of the row (assembled in apply). */
export interface UpdateRowInjected {
  /** Ask the Host for the update verdict (same-origin fetch of the route). */
  check: () => Promise<UpdateCheckPayload>
}

/** Full component props: runtime share + locale seat + injected face. */
export type UpdateRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'catppuccin'> & UpdateRowInjected

/** One phase of the row's interaction. */
type Phase = 'idle' | 'checking' | 'done'

/** Copy the upgrade command; falls back to no-op when the clipboard is unavailable. */
async function copyCommand(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Map a stable error code to its locale key (unknown codes fall back to the generic message). */
function errorKey(code: UpdateErrorCode | undefined): CatppuccinKey {
  switch (code) {
    case 'registry-unreachable': return 'update.err.registry'
    case 'registry-http': return 'update.err.http'
    case 'no-dist-tags': return 'update.err.noTags'
    case 'invalid-response': return 'update.err.invalid'
    case 'network': return 'update.err.network'
    default: return 'update.failed'
  }
}

/**
 * Render the update-check row: title, description, a check button, and the
 * verdict once checked.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function UpdateRow({ t, check }: UpdateRowProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [payload, setPayload] = useState<UpdateCheckPayload | null>(null)
  const [copied, setCopied] = useState(false)

  const runCheck = async (): Promise<void> => {
    setPhase('checking')
    setCopied(false)
    try {
      setPayload(await check())
    } catch {
      setPayload({ ok: false, code: 'network', error: 'network' })
    } finally {
      setPhase('done')
    }
  }

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    cursor: phase === 'checking' ? 'default' : 'pointer',
    font: 'inherit',
    opacity: phase === 'checking' ? 0.6 : 1,
  }

  const localInstall = payload?.ok === true && payload.installSource !== undefined
    && payload.installSource !== 'registry'

  return (
    <div style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0' }}>
      <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: '22px' }}>
        {t('update.title')}
      </div>
      <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
        {t('update.description')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <button type="button" disabled={phase === 'checking'} onClick={() => void runCheck()} style={buttonStyle}>
            {phase === 'checking' ? t('update.checking') : t('update.check')}
          </button>
          {payload?.ok === true && payload.current !== undefined && (
            <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px' }}>
              {t('update.current')} {payload.current}
            </span>
          )}
          {payload?.ok === true && payload.checkedAt !== undefined && (
            <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, lineHeight: '18px' }}>
              {t('update.checkedAt')} {new Date(payload.checkedAt).toLocaleString()}
            </span>
          )}
        </div>

        {phase === 'done' && payload !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {payload.ok === true ? (
              payload.outdated === true && payload.latest !== undefined ? (
                <>
                  <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 12, lineHeight: '18px' }}>
                    {t('update.available')} <strong>{payload.latest}</strong>
                  </div>
                  {payload.updateCommand !== undefined && (
                    <>
                      <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
                        {payload.profileDetected === true && payload.profile !== undefined
                          ? t('update.commandHintDetected').replace('{profile}', payload.profile)
                          : t('update.commandHint')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <code style={{
                          flex: '1 1 260px',
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--dsw-alias-border-l1)',
                          background: 'var(--dsw-alias-bg-layer-1)',
                          color: 'var(--dsw-alias-label-primary)',
                          fontSize: 12,
                          lineHeight: '18px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        }}>
                          {payload.updateCommand}
                        </code>
                        <button
                          type="button"
                          onClick={() => { void copyCommand(payload.updateCommand ?? '').then(setCopied) }}
                          style={{ ...buttonStyle, cursor: 'pointer' }}
                        >
                          {copied ? t('update.copied') : t('update.copy')}
                        </button>
                      </div>
                      {localInstall && (
                        <div style={{ color: 'var(--dsw-alias-label-warning, var(--dsw-alias-label-tertiary))', fontSize: 12, lineHeight: '18px' }}>
                          {t('update.localInstall')}
                        </div>
                      )}
                      <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
                        {t('update.restartHint')}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 12, lineHeight: '18px' }}>
                  {t('update.upToDate')}
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
                  {t(errorKey(payload.code))}
                </span>
                <button type="button" onClick={() => void runCheck()} style={{ ...buttonStyle, cursor: 'pointer' }}>
                  {t('update.retry')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
