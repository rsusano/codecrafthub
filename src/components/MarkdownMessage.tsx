"use client";

import ReactMarkdown from "react-markdown";

type MarkdownMessageProps = {
  text: string;
};

export default function MarkdownMessage({ text }: MarkdownMessageProps) {
  return (
    <div className="assistant-markdown">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="assistant-link"
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
