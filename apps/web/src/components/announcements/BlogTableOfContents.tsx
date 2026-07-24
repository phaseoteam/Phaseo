import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlogTocItem } from "@/lib/content/blogToc";

type BlogTableOfContentsProps = {
	items: BlogTocItem[];
};

function getTocScript(items: BlogTocItem[]) {
	const itemIds = JSON.stringify(items.map((item) => item.id)).replace(
		/</g,
		"\\u003c",
	);

	return `(() => {
  const itemIds = new Set(${itemIds});
  let frame = 0;

  const updateActiveSection = () => {
    frame = 0;
    const headings = [...itemIds]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!headings.length) return;

    let activeId = headings[0].id;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= 160) activeId = heading.id;
      else break;
    }

    document.querySelectorAll("[data-blog-toc-id]").forEach((link) => {
      const isActive = link.dataset.blogTocId === activeId;
      link.dataset.active = String(isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });

    document.querySelectorAll("[data-blog-toc-list]").forEach((list) => {
      const activeLink = list.querySelector("[data-blog-toc-id][data-active=true]");
      const indicator = list.querySelector("[data-blog-toc-indicator]");
      if (!activeLink || !indicator) return;
      indicator.style.height = activeLink.offsetHeight + "px";
      indicator.style.transform = "translateY(" + activeLink.offsetTop + "px)";
    });
  };

  const requestUpdate = () => {
    if (frame) return;
    frame = requestAnimationFrame(updateActiveSection);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  document.addEventListener("scroll", requestUpdate, { capture: true, passive: true });
  window.addEventListener("resize", requestUpdate);
  window.addEventListener("hashchange", requestUpdate);
  new MutationObserver(requestUpdate).observe(document.body, { childList: true, subtree: true });
  requestUpdate();
})();`;
}

function TableOfContentsLinks({ items }: { items: BlogTocItem[] }) {
	return (
		<nav aria-label="Table of contents">
			<ul className="space-y-1">
				{items.map((item) => {
					return (
						<li key={item.id}>
							<Link
								href={`#${item.id}`}
								aria-current={item.id === items[0]?.id ? "location" : undefined}
								data-active={item.id === items[0]?.id ? "true" : "false"}
								data-blog-toc-id={item.id}
								className={cn(
                  "block border-l-2 border-transparent py-1.5 text-sm leading-5 text-zinc-500 transition-colors data-[active=true]:font-medium data-[active=true]:text-zinc-950 dark:text-zinc-400 dark:data-[active=true]:text-zinc-50",
									item.level === 3 ? "pl-5 text-xs" : "pl-3",
									"hover:border-zinc-300 hover:text-zinc-950 dark:hover:border-zinc-700 dark:hover:text-zinc-50",
								)}
							>
								{item.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

export function BlogTableOfContents({ items }: BlogTableOfContentsProps) {
	return (
		<>
			<div className="lg:hidden">
				<details className="group border-y border-zinc-200 py-4 dark:border-zinc-800">
					<summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-950 marker:hidden dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
						<span>On this page</span>
						<ChevronDown
							aria-hidden="true"
							className="size-4 text-zinc-500 transition-transform duration-200 group-open:rotate-180 dark:text-zinc-400"
						/>
					</summary>
					<div className="mt-4">
						<TableOfContentsLinks items={items} />
					</div>
				</details>
			</div>

			<aside className="sticky top-[calc(var(--site-header-height,3.75rem)+1rem)] hidden max-h-[calc(100vh-5rem)] w-56 shrink-0 overflow-y-auto lg:block">
				<p className="mb-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
					On this page
				</p>
				<div data-blog-toc-list className="relative">
					<span
						data-blog-toc-indicator
						aria-hidden="true"
						className="pointer-events-none absolute left-0 top-0 z-10 h-6 w-0.5 rounded-full bg-sky-500 transition-[height,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
					/>
					<TableOfContentsLinks items={items} />
				</div>
			</aside>
			<script dangerouslySetInnerHTML={{ __html: getTocScript(items) }} />
		</>
	);
}
