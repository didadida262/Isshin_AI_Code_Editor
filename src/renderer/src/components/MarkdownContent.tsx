import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import Markdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import {
  oneLight,
  vscDarkPlus,
} from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { useTheme } from '../providers/ThemeProvider'

type Props = {
  content: string
  /** User bubble: slightly tighter typography */
  compact?: boolean
}

/** Map common fence ids to Prism language keys */
const mapPrismLang = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  py: 'python',
  rs: 'rust',
  cpp: 'cpp',
  h: 'c',
} as const

function resolvePrismLanguage(raw: string): string {
  const key = raw.toLowerCase()
  if (key in mapPrismLang) {
    return mapPrismLang[key as keyof typeof mapPrismLang]
  }
  return key
}

const CODE_FONT_SIZE = '13px'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

function CodeBlock({
  language,
  code,
}: {
  language: string
  code: string
}) {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)
  const prismStyle = theme === 'dark' ? vscDarkPlus : oneLight

  const onCopy = useCallback(async () => {
    const ok = await copyText(code)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }, [code])

  const langLabel = language === 'text' || !language ? 'plaintext' : language

  return (
    <div
      className="group/code my-4 overflow-hidden rounded-xl border border-zinc-300/90 bg-[#fafafa] shadow-sm dark:border-zinc-600/80 dark:bg-[#1e1e1e]"
      data-code-block
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200/90 bg-zinc-100/90 px-3 py-2 dark:border-zinc-600/60 dark:bg-zinc-900/85">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {langLabel}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md border border-transparent px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200/90 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          aria-label="复制代码"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter
        language={resolvePrismLanguage(language)}
        style={prismStyle}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '14px 16px',
          background: 'transparent',
          fontSize: CODE_FONT_SIZE,
          lineHeight: 1.55,
        }}
        codeTagProps={{
          style: {
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          },
        }}
        showLineNumbers={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

const mdComponents = (compact: boolean) =>
  ({
    pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
    code: ({
      className,
      children,
      ...rest
    }: {
      className?: string
      children?: ReactNode
    }) => {
      const text = String(children).replace(/\n$/, '')
      const match = /language-(\w+)/.exec(className || '')
      if (match) {
        return (
          <CodeBlock
            language={match[1].toLowerCase()}
            code={text}
          />
        )
      }
      if (text.includes('\n')) {
        return <CodeBlock language="text" code={text} />
      }
      return (
        <code
          className={
            compact
              ? 'rounded-md bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-100'
              : 'rounded-md bg-zinc-200/90 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-800 dark:bg-zinc-700/90 dark:text-zinc-100'
          }
          {...rest}
        >
          {children}
        </code>
      )
    },
    p: ({ children }: { children?: ReactNode }) => (
      <p className="mb-3 last:mb-0 [&:empty]:hidden">{children}</p>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
    ),
    li: ({ children }: { children?: ReactNode }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    a: ({
      href,
      children,
    }: {
      href?: string
      children?: ReactNode
    }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-cyan-700 underline decoration-cyan-700/30 underline-offset-2 hover:text-cyan-600 dark:text-cyan-300 dark:decoration-cyan-400/40 dark:hover:text-cyan-200"
      >
        {children}
      </a>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="font-semibold text-zinc-900 dark:text-zinc-50">
        {children}
      </strong>
    ),
    em: ({ children }: { children?: ReactNode }) => (
      <em className="italic">{children}</em>
    ),
    h1: ({ children }: { children?: ReactNode }) => (
      <h1 className="mb-2 mt-4 text-lg font-bold first:mt-0">{children}</h1>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h3>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="my-3 border-l-4 border-cyan-500/50 pl-3 text-zinc-600 italic dark:text-zinc-400">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-4 border-zinc-200 dark:border-zinc-700" />
    ),
    table: ({
      children,
    }: {
      children?: ReactNode
    }) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: ReactNode }) => (
      <thead className="bg-zinc-100 dark:bg-zinc-800/80">{children}</thead>
    ),
    th: ({ children }: { children?: ReactNode }) => (
      <th className="border border-zinc-200 px-3 py-2 text-left font-semibold dark:border-zinc-600">
        {children}
      </th>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <td className="border border-zinc-200 px-3 py-2 dark:border-zinc-600">
        {children}
      </td>
    ),
    tr: ({ children }: { children?: ReactNode }) => (
      <tr className="even:bg-zinc-50/80 dark:even:bg-zinc-900/40">{children}</tr>
    ),
  }) as const

/**
 * 过滤掉 <think> 思考过程，不让用户看到
 */
function filterThinkingContent(content: string): string {
  // 移除所有 <think>...</think> 标签及其内容（包括多行）
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

export function MarkdownContent({ content, compact = false }: Props) {
  // 过滤掉思考过程
  const filteredContent = filterThinkingContent(content)
  
  return (
    <div className={compact ? 'text-sm leading-snug' : 'text-sm leading-relaxed'}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={
          mdComponents(compact) as ComponentProps<typeof Markdown>['components']
        }
      >
        {filteredContent}
      </Markdown>
    </div>
  )
}
