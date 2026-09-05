/**
 * Update-check settings row — one General-section preference row that asks
 * the Host's `/catppuccin/check-update` route for the latest published npm
 * version and reports whether this install is current. Detection is Host-side
 * (Node fetch, no CORS, profile probe included); the row renders the verdict
 * and, when an update is available, offers the copyable CLI upgrade command
 * whose profile name the Host already probed. Upgrading itself stays a
 * terminal action (`dsh plugin … add @latest`) — the row never touches the
 * profile workspace.
 *
 * Beyond the check button the row carries:
 *  - the auto-check switch (item H) and the release-channel segmented pick
 *    (item I), both persisted through the durable state;
 *  - an automatic retry 30s after a failed check (item V) with a countdown;
 *  - a conflict banner (item C/X) when a durable write from another window
 *    superseded a local change ("另一窗口已更新，本地改动未保存");
 *  - the latest auto-check verdict (item H) surfaced on mount;
 *  - a "?" help affordance (item J, native `title` tooltip).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UpdateCheckPayload, UpdateErrorCode, UpdateChannel } from '../update-check.ts'
import type { CatppuccinKey } from './locales.ts'

/** Auto-retry scheduled after a failed check (item V): one retry after 30s,
 *  then it stops — the discipline lives here in the row, never in a hanging
 *  route request. */
export const UPDATE_RETRY_AFTER_MS = 30_000

/** Injected business face of the row (assembled in apply). */
export interface UpdateRowInjected {
  /** Ask the Host for the update verdict (same-origin fetch of the route).
   *  The channel preference rides the query string (item I). */
  check: (channel: UpdateChannel) => Promise<UpdateCheckPayload>
  /** Whether automatic checks are on (item H). */
  autoCheck: () => boolean
  /** Set the auto-check preference (persists durably + re-arms timers). */
  setAutoCheck: (value: boolean) => void
  /** The persisted release channel (item I). */
  channel: () => UpdateChannel
  /** Set the release channel (persists durably). */
  setChannel: (channel: UpdateChannel) => void
  /** Subscribe to preference changes (auto-check / channel). */
  subscribePrefs: (listener: () => void) => () => void
  /** The latest auto-check verdict, or null before the first one (item H). */
  lastAutoResult: () => UpdateCheckPayload | null
  /** Subscribe to durable-write conflict notices (item C/X). */
  subscribeConflict: (listener: () => void) => () => void
  /** Number of conflicts this session has seen (item C/X). */
  conflictCount: () => number
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
    case 'network.local': return 'update.err.networkLocal'
    case 'network.upstream': return 'update.err.networkUpstream'
    default: return 'update.failed'
  }
}

const switchBase: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  flex: 'none',
  width: 44,
  height: 24,
  padding: 0,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-2)',
  cursor: 'pointer',
}

const knobStyle: React.CSSProperties = {
  position: 'absolute',
  top: 3,
  left: 3,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: 'var(--dsw-alias-label-tertiary)',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 10,
  lineHeight: 1,
  transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
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
  cursor: 'pointer',
  font: 'inherit',
}

/**
 * Render the update-check row: title, description, auto-check switch,
 * channel pick, a check button, and the verdict once checked.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function UpdateRow({
  t,
  check,
  autoCheck,
  setAutoCheck,
  channel,
  setChannel,
  subscribePrefs,
  lastAutoResult,
  subscribeConflict,
  conflictCount,
}: UpdateRowProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [payload, setPayload] = useState<UpdateCheckPayload | null>(null)
  const [copied, setCopied] = useState(false)
  const autoCheckOn = useSyncExternalStore(subscribePrefs, autoCheck)
  const channelValue = useSyncExternalStore(subscribePrefs, channel)
  const conflicts = useSyncExternalStore(subscribeConflict, conflictCount)
  const [dismissedConflicts, setDismissedConflicts] = useState(0)
  // Item V: one automatic retry after a failure, 30s later ("仍失败则停").
  const [retryRemaining, setRetryRemaining] = useState<number | null>(null)
  const retryTimer = useRef<number | undefined>(undefined)
  const mounted = useRef(true)

  const runCheck = async (withChannel: UpdateChannel = channelValue): Promise<void> => {
    if (retryTimer.current !== undefined) {
      window.clearTimeout(retryTimer.current)
      retryTimer.current = undefined
      setRetryRemaining(null)
    }
    setPhase('checking')
    setCopied(false)
    let next: UpdateCheckPayload
    try {
      next = await check(withChannel)
    } catch {
      next = { ok: false, code: 'network.local', error: 'network.local' }
    }
    setPayload(next)
    setPhase('done')
    if (!next.ok) {
      // Schedule exactly one auto-retry (item V); a later manual check
      // cancels it via the timer cleanup above.
      const target = Date.now() + UPDATE_RETRY_AFTER_MS
      setRetryRemaining(UPDATE_RETRY_AFTER_MS / 1000)
      const ticker = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000))
        setRetryRemaining(remaining)
        if (remaining <= 0) window.clearInterval(ticker)
      }, 1000)
      retryTimer.current = window.setTimeout(() => {
        window.clearInterval(ticker)
        retryTimer.current = undefined
        setRetryRemaining(null)
        if (mounted.current) void runCheck()
      }, UPDATE_RETRY_AFTER_MS)
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (retryTimer.current !== undefined) window.clearTimeout(retryTimer.current)
    }
  }, [])

  const autoResult = lastAutoResult()
  const localInstall = payload?.ok === true && payload.installSource !== undefined
    && payload.installSource !== 'registry'
  // DSH Desktop adapts the copy: its target profile comes from the Desktop
  // service and the hint/restart text says so, while standard dsh web keeps
  // the terminal copy.
  const isDesktop = payload?.ok === true && payload.env === 'desktop'
  const showConflict = conflicts > dismissedConflicts

  return (
    <div style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0' }}>
      <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: '22px', display: 'flex', alignItems: 'center' }}>
        {t('update.title')}
        <span
          role="img"
          aria-label={t('update.helpLabel')}
          title={t('update.help')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1px solid var(--dsw-alias-border-l2)',
            color: 'var(--dsw-alias-label-tertiary)',
            fontSize: 11,
            lineHeight: 1,
            cursor: 'help',
            userSelect: 'none',
            marginLeft: 6,
            flex: 'none',
          }}
        >
          ?
        </span>
      </div>
      <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
        {t('update.description')}
      </div>

      {/* Conflict banner (item C/X): another window's durable write won. */}
      {showConflict && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-state-business-tertiary)' }}>
          <span style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 12, lineHeight: '18px' }}>
            {t('update.conflict')}
          </span>
          <button
            type="button"
            aria-label={t('update.conflictDismiss')}
            onClick={() => { setDismissedConflicts(conflicts) }}
            style={{ ...buttonStyle, padding: '2px 8px', fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Auto-check + channel preferences (items H/I). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px' }}>
            {t('update.autoCheck')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoCheckOn}
            aria-label={t('update.autoCheck')}
            onClick={() => { setAutoCheck(!autoCheckOn) }}
            style={{ ...switchBase, background: autoCheckOn ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-bg-layer-2)' }}
          >
            <span aria-hidden="true" style={{ ...knobStyle, transform: autoCheckOn ? 'translateX(22px)' : undefined, background: autoCheckOn ? 'var(--dsw-alias-bg-layer-1)' : 'var(--dsw-alias-label-tertiary)' }}>
              {autoCheckOn ? '✓' : ''}
            </span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px' }}>
            {t('update.channel')}
          </span>
          <div style={{ display: 'inline-flex', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, overflow: 'hidden' }} role="group" aria-label={t('update.channel')}>
            {(['latest', 'beta'] as const).map((option, index) => (
              <button
                key={option}
                type="button"
                aria-pressed={channelValue === option}
                onClick={() => { setChannel(option) }}
                style={{
                  height: 26,
                  padding: '0 12px',
                  border: 'none',
                  borderLeft: index > 0 ? '1px solid var(--dsw-alias-border-l2)' : undefined,
                  background: channelValue === option ? 'var(--dsw-alias-state-business-tertiary)' : 'transparent',
                  color: channelValue === option ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-secondary)',
                  fontSize: 12,
                  lineHeight: '18px',
                  cursor: 'pointer',
                }}
              >
                {t(option === 'latest' ? 'update.channelLatest' : 'update.channelBeta')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto-check verdict surfaced at mount (item H). */}
      {autoResult?.ok === true && autoResult.outdated === true && autoResult.latest !== undefined && (
        <div style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 12, lineHeight: '18px' }}>
          {t('update.autoAvailable')} <strong>{autoResult.latest}</strong>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <button type="button" disabled={phase === 'checking'} onClick={() => void runCheck()} style={{ ...buttonStyle, cursor: phase === 'checking' ? 'default' : 'pointer', opacity: phase === 'checking' ? 0.6 : 1 }}>
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
                        {isDesktop
                          ? t('update.commandHintDesktop').replace('{profile}', payload.profile ?? '')
                          : payload.profileDetected === true && payload.profile !== undefined
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
                        {t(isDesktop ? 'update.restartHintDesktop' : 'update.restartHint')}
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
                {retryRemaining !== null && retryRemaining > 0 && (
                  <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' }}>
                    {t('update.retryHint').replace('{s}', String(retryRemaining))}
                  </span>
                )}
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