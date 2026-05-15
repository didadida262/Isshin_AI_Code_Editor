import {
  faCodeBranch,
  faExclamationTriangle,
  faInfoCircle,
  faSyncAlt,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

type Props = {
  branch?: string
  language?: string
  errors?: number
  warnings?: number
  line?: number
  col?: number
}

export function StatusBar({
  branch = 'main',
  language = 'TypeScript',
  errors = 0,
  warnings = 0,
  line = 1,
  col = 1,
}: Props) {
  return (
    <footer
      className="flex h-[22px] shrink-0 items-center justify-between bg-[#181818] px-2 text-[#cccccc] border-t border-[#3c3c3c]"
      aria-label="状态栏"
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1 text-[12px] opacity-90 hover:opacity-100 transition-opacity"
          title="切换分支"
        >
          <FontAwesomeIcon icon={faCodeBranch} className="text-[11px]" />
          <span>{branch}</span>
        </button>

        <button
          type="button"
          className="flex items-center gap-1 text-[12px] opacity-90 hover:opacity-100 transition-opacity"
          title="同步"
        >
          <FontAwesomeIcon icon={faSyncAlt} className="text-[10px]" />
        </button>

        {errors > 0 && (
          <span className="flex items-center gap-1 text-[12px]">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-[10px]" />
            {errors}
          </span>
        )}
        {warnings > 0 && (
          <span className="flex items-center gap-1 text-[12px] opacity-80">
            <FontAwesomeIcon icon={faInfoCircle} className="text-[10px]" />
            {warnings}
          </span>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-[12px] opacity-90 hover:opacity-100 transition-opacity"
          title="跳转到行"
        >
          行 {line}，列 {col}
        </button>
        <button
          type="button"
          className="text-[12px] opacity-90 hover:opacity-100 transition-opacity"
          title="选择语言模式"
        >
          {language}
        </button>
        <button
          type="button"
          className="text-[12px] opacity-90 hover:opacity-100 transition-opacity"
          title="选择编码"
        >
          UTF-8
        </button>
        <button
          type="button"
          className="text-[12px] opacity-90 hover:opacity-100 transition-opacity"
          title="选择行尾字符"
        >
          LF
        </button>
        <span className="text-[12px] opacity-50">Isshin AI Code Editor</span>
      </div>
    </footer>
  )
}
