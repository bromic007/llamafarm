import { ChatboxMessage } from '../../types/chatbox'

export interface MessageProps {
  message: ChatboxMessage
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const { type, content, isLoading, isStreaming } = message

  // Show typing indicator while assistant is preparing/streaming with no content yet
  const showTypingIndicator =
    type === 'assistant' &&
    (isLoading || isStreaming) &&
    (!content || content.trim() === '' || content === 'Thinking...')

  // Minimal markdown renderer with safe HTML escaping and light formatting.
  // Supports: inline code, bold, italics (without spanning lines), and bullet markers.
  const renderMarkdown = (text: string): { __html: string } => {
    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    // Escape first
    let html = escapeHtml(text)

    // Convert leading list markers to bullets to avoid italics regex picking up '* '
    // Matches start-of-line '-' or '*' followed by space across lines
    html = html.replace(/(^|\n)\s*[-*]\s+/g, '$1• ')

    // Markdown links [text](url)
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline text-primary hover:opacity-80">$1<\/a>'
    )

    // Inline code `code`
    html = html.replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-muted/60">$1</code>'
    )

    // Bold using **text** or __text__ on a single line (non-greedy)
    html = html.replace(/(\*\*|__)([^\n]+?)\1/g, '<strong>$2<\/strong>')

    // Italic using asterisks. Avoid list markers and span only within a single line.
    // Require non-space characters inside and whitespace or line boundaries outside.
    html = html.replace(
      /(^|[\s[(])\*([^\s][^*\n]*?)\*(?=[\s)\].,;!?]|$)/g,
      '$1<em>$2</em>'
    )

    // Italic using underscores as well
    html = html.replace(
      /(^|[\s[(])_([^\s][^_\n]*?)_(?=[\s)\].,;!?]|$)/g,
      '$1<em>$2</em>'
    )

    // Preserve line breaks
    html = html.replace(/\n/g, '<br/>')
    return { __html: html }
  }

  const getMessageStyles = (): string => {
    const baseStyles = 'flex flex-col mb-4'

    switch (type) {
      case 'user':
        return `${baseStyles} self-end max-w-[80%] md:max-w-[90%]`
      default:
        return baseStyles
    }
  }

  const getContentStyles = (): string => {
    const baseBubble = 'px-4 py-3 md:px-4 md:py-3 rounded-lg'

    switch (type) {
      case 'user':
        return `${baseBubble} bg-secondary text-foreground text-base leading-relaxed`
      case 'assistant':
        return 'text-[15px] md:text-base leading-relaxed text-foreground/90'
      case 'system':
        return `${baseBubble} bg-green-500 text-white rounded-2xl border-green-500 italic`
      case 'error':
        return `${baseBubble} bg-red-500 text-white rounded-2xl rounded-bl-sm border-red-500`
      default:
        return `${baseBubble} bg-muted text-foreground`
    }
  }

  return (
    <div className={getMessageStyles()}>
      <div className={getContentStyles()}>
        {type === 'assistant' ? (
          isLoading ? (
            <span className="italic opacity-70">{content}</span>
          ) : (
            <div
              className="whitespace-pre-wrap leading-relaxed"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={renderMarkdown(content)}
            />
          )
        ) : (
          <span className="whitespace-pre-wrap">{content}</span>
        )}
        {showTypingIndicator && (
          <span
            className="inline-flex items-center gap-1 ml-1 align-middle"
            aria-label="Assistant is typing"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce [animation-delay:-0.1s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/70 animate-bounce" />
          </span>
        )}
      </div>
    </div>
  )
}

export default Message
