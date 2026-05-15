import {
  faCodeBranch,
  faCommentDots,
  faFile,
  faMagnifyingGlass,
  faPuzzlePiece,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

type Section = 'explorer' | 'search' | 'git' | 'extensions' | 'chat'

type Props = {
  activeSection: Section
  onSectionChange: (s: Section) => void
}

type TopItem = { id: Section; icon: typeof faFile; label: string }

const TOP_ITEMS: TopItem[] = [
  { id: 'explorer', icon: faFile, label: '资源管理器' },
  { id: 'search', icon: faMagnifyingGlass, label: '搜索' },
  { id: 'git', icon: faCodeBranch, label: '源代码管理' },
  { id: 'extensions', icon: faPuzzlePiece, label: '扩展' },
  { id: 'chat', icon: faCommentDots, label: 'Isshin AI Code Editor' },
]

export function ActivityBar({ activeSection, onSectionChange }: Props) {
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

      <div className="flex flex-col items-center gap-0.5 pb-1">
        <button
          type="button"
          title="账户"
          aria-label="账户"
          className="flex h-12 w-12 items-center justify-center text-[18px] text-[#858585] transition-colors hover:text-[#cccccc]"
        >
          <FontAwesomeIcon icon={faUser} />
        </button>
      </div>
    </aside>
  )
}
