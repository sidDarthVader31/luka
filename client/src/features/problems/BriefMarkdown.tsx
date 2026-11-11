import type { ReactNode } from "react";

import { type Inline, parseMarkdown } from "./parse-markdown";

function renderInline(content: Inline[]): ReactNode[] {
  return content.map((part, index) => {
    const key = `${index}-${part.type}`;
    switch (part.type) {
      case "strong":
        return <strong key={key}>{part.text}</strong>;
      case "em":
        return <em key={key}>{part.text}</em>;
      case "code":
        return <code key={key}>{part.text}</code>;
      default:
        return part.text;
    }
  });
}

/** Renders a problem brief. Text is always rendered as React text nodes, never as HTML. */
export function BriefMarkdown({ source }: { source: string }) {
  return (
    <>
      {parseMarkdown(source).map((block, index) => {
        const key = `${index}-${block.type}`;
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
          return <Tag key={key}>{renderInline(block.content)}</Tag>;
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={key}>
              {block.items.map((item, itemIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reordered
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={key}>{renderInline(block.content)}</p>;
      })}
    </>
  );
}
