import Markdown from "react-markdown";
import { isSafeHttpUrl } from "@/lib/url";

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      urlTransform={(url) => (isSafeHttpUrl(url) ? url : "")}
      components={{
        a: ({ href, children: linkChildren }) => {
          if (!isSafeHttpUrl(href)) {
            return <span>{linkChildren}</span>;
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {linkChildren}
            </a>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
}
