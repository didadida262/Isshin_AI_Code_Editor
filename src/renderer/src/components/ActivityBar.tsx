import {
  faFile,
  faMagnifyingGlass,
  faUser,
  faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useState, useRef, useEffect } from 'react'
import type { WechatUser } from './WechatLoginModal'

type Section = 'explorer' | 'search'

type Props = {
  activeSection: Section
  onSectionChange: (s: Section) => void
  currentUser?: WechatUser | null
  onAccountClick: () => void
  onLogout?: () => void
}

type TopItem = { id: Section; icon: typeof faFile; label: string }

const TOP_ITEMS: TopItem[] = [
  { id: 'explorer', icon: faFile, label: '资源管理器' },
  { id: 'search', icon: faMagnifyingGlass, label: '搜索' },
]

export function ActivityBar({
  activeSection,
  onSectionChange,
  currentUser,
  onAccountClick,
  onLogout,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleAccountClick = () => {
    if (currentUser) {
      setMenuOpen((v) => !v)
    } else {
      onAccountClick()
    }
  }

  return (
    <aside
      className="flex h-full w-12 shrink-0 flex-col items-center justify-between border-r border-[#3c3c3c] bg-[#181818] py-1"
      aria-label="活动栏"
    >
      <div className="flex flex-col items-center gap-0.5">
        {TOP_ITEMS.map((item) => {
          const isActive = activeSection === item.id
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={isActive}
              onClick={() => onSectionChange(item.id)}
              className={[
                'relative flex h-12 w-12 items-center justify-center text-[18px] transition-colors duration-100',
                isActive
                  ? 'text-[#cccccc] before:absolute before:left-0 before:top-1/2 before:h-6 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-[#cccccc] before:content-[""]'
                  : 'text-[#858585] hover:text-[#cccccc]',
              ].join(' ')}
            >
              <FontAwesomeIcon icon={item.icon} />
            </button>
          )
        })}
      </div>

      {/* Account button + popup menu */}
      <div className="relative flex flex-col items-center gap-0.5 pb-1" ref={menuRef}>
        {/* Logged-in user popup menu */}
        {menuOpen && currentUser && (
          <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-50">
            <div className="w-[180px] rounded-xl bg-[#252535] border border-[#3c3c3c] shadow-2xl overflow-hidden">
              {/* User info row */}
              <div className="flex items-center gap-2.5 px-3 py-3 border-b border-[#3c3c3c]">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.nickname}
                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#07C160] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {currentUser.nickname.charAt(0)}
                  </div>
                )}
                <span className="text-[#cccccc] text-xs font-medium truncate">
                  {currentUser.nickname}
                </span>
              </div>
              {/* Logout button */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onLogout?.()
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[#858585] hover:text-[#cccccc] hover:bg-[#3c3c3c] transition-colors text-xs"
              >
                <FontAwesomeIcon icon={faRightFromBracket} className="text-[11px]" />
                退出登录
              </button>
            </div>
          </div>
        )}

        {/* Avatar / Login button */}
        <button
          type="button"
          title={currentUser ? currentUser.nickname : '账户登录'}
          aria-label={currentUser ? `账户：${currentUser.nickname}` : '登录账户'}
          onClick={handleAccountClick}
          className="relative flex h-12 w-12 items-center justify-center text-[18px] text-[#858585] transition-colors hover:text-[#cccccc]"
        >
          {currentUser ? (
            currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.nickname}
                className="w-7 h-7 rounded-full object-cover border-2 border-[#07C160]"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#07C160] flex items-center justify-center text-white text-xs font-bold">
                {currentUser.nickname.charAt(0)}
              </div>
            )
          ) : (
            <FontAwesomeIcon icon={faUser} />
          )}
        </button>
      </div>
    </aside>
  )
}
