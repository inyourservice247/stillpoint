import type { ReaderToken } from "../types/Token";

type ContextPreviewProps = {
  tokens: ReaderToken[];
  currentIndex: number;
  visible: boolean;
};

export function ContextPreview({ tokens, currentIndex, visible }: ContextPreviewProps) {
  const start = Math.max(0, currentIndex - 10);
  const end = Math.min(tokens.length, currentIndex + 11);
  const excerpt = tokens.slice(start, end);

  return (
    <p className={`context-preview ${visible ? "context-preview--visible" : ""}`} aria-hidden={!visible}>
      {start > 0 && <span>… </span>}
      {excerpt.map((token, offset) => {
        const index = start + offset;
        return index === currentIndex ? (
          <mark key={index}>{token.text}</mark>
        ) : (
          <span key={index}>{token.text}</span>
        );
      }).reduce<React.ReactNode[]>((parts, node, index) => {
        if (index > 0) parts.push(" ");
        parts.push(node);
        return parts;
      }, [])}
      {end < tokens.length && <span> …</span>}
    </p>
  );
}
