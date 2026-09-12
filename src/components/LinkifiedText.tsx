"use client";

import { Fragment, type ReactNode } from "react";

const TOKEN_REGEX =
  /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>"')\]]+)/g;
const MARKDOWN_LINK_REGEX = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/;

function trimTrailingPunctuation(url: string): {
  href: string;
  trailing: string;
} {
  const match = url.match(/[),.;!?]+$/);
  if (!match) return { href: url, trailing: "" };
  return {
    href: url.slice(0, -match[0].length),
    trailing: match[0],
  };
}

export default function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(TOKEN_REGEX);

  const nodes: ReactNode[] = parts.map((part, index) => {
    if (!part) return null;

    const markdown = part.match(MARKDOWN_LINK_REGEX);
    if (markdown) {
      const label = markdown[1];
      const href = markdown[2];
      return (
        <a
          key={`md-${index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="assistant-link"
        >
          {label}
        </a>
      );
    }

    if (/^https?:\/\//.test(part)) {
      const { href, trailing } = trimTrailingPunctuation(part);
      return (
        <Fragment key={`url-${index}`}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="assistant-link"
          >
            {href}
          </a>
          {trailing}
        </Fragment>
      );
    }

    return <Fragment key={`txt-${index}`}>{part}</Fragment>;
  });

  return <>{nodes}</>;
}
