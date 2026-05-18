import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark, faRotateRight } from '@fortawesome/free-solid-svg-icons'

export interface WechatUser {
  openid: string
  nickname: string
  avatar: string
  access_token: string
}

interface Props {
  open: boolean
  agentBaseUrl?: string
  onClose: () => void
  onLoginSuccess: (user: WechatUser, state: string) => void
}

type Status = 'loading' | 'waiting' | 'success' | 'failed' | 'not_configured'

const POLL_INTERVAL_MS = 2000

export function WechatLoginModal({
  open,
  agentBaseUrl = 'http://127.0.0.1:8788',
  onClose,
  onLoginSuccess,
}: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [qrcodeUrl, setQrcodeUrl] = useState('')
  const [currentState, setCurrentState] = useState('')
  const [user, setUser] = useState<WechatUser | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  // postMessage listener — catches the iframe callback page notification
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'wechat_oauth') return
      if (e.data.status === 'success') {
        stopPolling()
        setUser(e.data.user as WechatUser)
        setStatus('success')
        onLoginSuccess(e.data.user as WechatUser, currentState)
      } else if (e.data.status === 'failed') {
        stopPolling()
        setErrorMsg(e.data.error || '授权失败')
        setStatus('failed')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [currentState, onLoginSuccess, stopPolling])

  // Init / retry: fetch a fresh session from backend
  useEffect(() => {
    if (!open) {
      stopPolling()
      setStatus('loading')
      setQrcodeUrl('')
      setCurrentState('')
      setUser(null)
      setErrorMsg('')
      return
    }

    setStatus('loading')
    let cancelled = false

    fetch(`${agentBaseUrl}/auth/wechat/init`)
      .then((r) => r.json())
      .then((data: { state: string; qrcode_url: string; configured: boolean }) => {
        if (cancelled) return
        if (!data.configured) {
          setStatus('not_configured')
          return
        }
        setCurrentState(data.state)
        setQrcodeUrl(data.qrcode_url)
        setStatus('waiting')

        // Polling fallback in case postMessage doesn't arrive
        // (e.g. iframe sandbox blocks cross-origin postMessage)
        stopPolling()
        pollTimerRef.current = setInterval(async () => {
          try {
            const r = await fetch(`${agentBaseUrl}/auth/wechat/poll/${data.state}`)
            const d = await r.json()
            if (d.status === 'success') {
              stopPolling()
              setUser(d.user as WechatUser)
              setStatus('success')
              onLoginSuccess(d.user as WechatUser, data.state)
            } else if (d.status === 'failed') {
              stopPolling()
              setErrorMsg(d.error || '授权失败')
              setStatus('failed')
            }
          } catch {
            // ignore transient network errors
          }
        }, POLL_INTERVAL_MS)
      })
      .catch(() => {
        if (cancelled) return
        setErrorMsg('无法连接后端服务，请确认 Agent 服务已启动（端口 8788）')
        setStatus('failed')
      })

    return () => {
      cancelled = true
      stopPolling()
    }
    // retryKey triggers re-execution
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentBaseUrl, retryKey])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative w-[360px] rounded-2xl overflow-hidden shadow-2xl border border-[#3c3c3c] bg-[#1e1e2e]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2d2d3d]">
          <div className="flex items-center gap-2.5">
            {/* WeChat brand color dot */}
            <span className="inline-block w-3 h-3 rounded-full bg-[#07C160]" />
            <span className="text-[#cccccc] font-semibold text-sm tracking-wide">微信扫码登录</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#3c3c3c] transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} className="text-[13px]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center justify-center px-6 py-8 min-h-[340px]">
          {status === 'loading' && <LoadingView />}

          {status === 'not_configured' && <NotConfiguredView />}

          {status === 'waiting' && qrcodeUrl && (
            <WaitingView
              qrcodeUrl={qrcodeUrl}
              onManualOpen={() => {
                // open in system browser as fallback — works because Tauri allows
                // opening external URLs via the default browser
                window.open(
                  `https://open.weixin.qq.com/connect/qrconnect?${qrcodeUrl.split('?')[1] ?? ''}`,
                  '_blank',
                )
              }}
            />
          )}

          {status === 'success' && user && (
            <SuccessView user={user} onClose={onClose} />
          )}

          {status === 'failed' && (
            <FailedView
              message={errorMsg}
              onRetry={() => setRetryKey((k) => k + 1)}
            />
          )}
        </div>

        {/* Footer note */}
        {(status === 'waiting' || status === 'loading') && (
          <p className="text-center text-[#555] text-[11px] pb-4 px-6">
            使用「微信」扫描上方二维码，在手机上确认登录
          </p>
        )}
      </div>
    </div>
  )
}

// ── Sub-views ─────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-2 border-[#07C160] border-t-transparent rounded-full animate-spin" />
      <p className="text-[#858585] text-sm">正在生成二维码…</p>
    </div>
  )
}

function NotConfiguredView() {
  return (
    <div className="text-center space-y-4">
      <div className="text-5xl">⚙️</div>
      <p className="text-[#cccccc] font-medium text-sm">微信登录尚未配置</p>
      <div className="text-left bg-[#252535] rounded-xl p-4 text-xs space-y-1.5">
        <p className="text-[#858585]">请在后端设置以下环境变量后重启服务：</p>
        <p>
          <code className="text-[#569cd6]">WECHAT_APPID</code>
          <span className="text-[#858585]"> — 微信开放平台 AppID</span>
        </p>
        <p>
          <code className="text-[#569cd6]">WECHAT_APPSECRET</code>
          <span className="text-[#858585]"> — 微信开放平台 AppSecret</span>
        </p>
        <p className="text-[#858585] pt-1">
          前往{' '}
          <span className="text-[#569cd6]">open.weixin.qq.com</span>
          {' '}创建「网站应用」并获取凭据。
        </p>
      </div>
    </div>
  )
}

function WaitingView({
  qrcodeUrl,
  onManualOpen,
}: {
  qrcodeUrl: string
  onManualOpen: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-[#858585] text-xs">使用微信扫描下方二维码</p>

      {/* WeChat QR code embedded iframe */}
      <div className="w-[260px] h-[290px] bg-white rounded-xl overflow-hidden flex items-center justify-center shadow-lg">
        <iframe
          src={qrcodeUrl}
          width="260"
          height="290"
          frameBorder="0"
          scrolling="no"
          title="微信登录二维码"
          // allow-top-navigation lets WeChat redirect the iframe to our callback URL
          sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation"
        />
      </div>

      <button
        type="button"
        onClick={onManualOpen}
        className="text-[#858585] text-xs hover:text-[#cccccc] underline underline-offset-2 transition-colors"
      >
        二维码无法显示？在浏览器中打开
      </button>
    </div>
  )
}

function SuccessView({ user, onClose }: { user: WechatUser; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.nickname}
            className="w-20 h-20 rounded-full border-[3px] border-[#07C160] object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#07C160] flex items-center justify-center text-white text-3xl font-bold">
            {user.nickname.charAt(0)}
          </div>
        )}
        <span className="absolute -bottom-1 -right-1 text-xl">✅</span>
      </div>

      <div className="text-center">
        <p className="text-[#cccccc] font-semibold text-base">{user.nickname}</p>
        <p className="text-[#07C160] text-xs mt-1">已通过微信授权登录</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-1 px-8 py-2 bg-[#07C160] hover:bg-[#06ad55] active:bg-[#059948] text-white rounded-xl text-sm font-medium transition-colors"
      >
        开始使用
      </button>
    </div>
  )
}

function FailedView({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="text-5xl">❌</div>
      <div>
        <p className="text-[#cccccc] text-sm font-medium">登录失败</p>
        {message && (
          <p className="text-[#858585] text-xs mt-1 max-w-[260px] leading-relaxed">{message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 px-5 py-2 bg-[#3c3c3c] hover:bg-[#4a4a4a] text-[#cccccc] rounded-xl text-sm transition-colors"
      >
        <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
        重试
      </button>
    </div>
  )
}
