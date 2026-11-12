export const ChangelogFilters = ({ labels, clearLabel = "Clear" }) => {
	const [active, setActive] = useState([]);

	// "On this page" links percent-encode non-ASCII date anchors (Japanese, Hindi, Arabic ...), so compare decoded ids.
	const linkTarget = (link) => {
		const href = link?.getAttribute("href") ?? "";
		if (!href.startsWith("#")) return null;
		try {
			return decodeURIComponent(href.slice(1));
		} catch {
			return href.slice(1);
		}
	};

	useEffect(() => {
		const root = document.documentElement;
		let scrollMt = "";
		let frame = 0;

		// Mintlify keeps --scroll-mt (header height + 40px) inline on <html> and uses it for the sticky date labels
		// and anchor jumps, so it is raised by the bar's height and kept there.
		const keepScrollMt = () => {
			if (scrollMt && root.style.getPropertyValue("--scroll-mt") !== scrollMt) root.style.setProperty("--scroll-mt", scrollMt);
		};

		// The site header is 48px on desktop and taller on phones, so pin the bar to its real height.
		const pin = () => {
			const bar = document.querySelector(".changelog-filters");
			const navbar = document.getElementById("navbar");
			if (!bar) return;
			const top = navbar ? Math.max(0, navbar.getBoundingClientRect().bottom) : 0;
			bar.style.top = `${top}px`;
			scrollMt = `${top + bar.offsetHeight + 40}px`;
			keepScrollMt();
		};

		// Mintlify measures each date's position for "On this page" once and never again after the filters move dates
		// around, so its highlight drifts. Work out the current date from the live layout and mark it instead.
		const syncToc = () => {
			const toc = document.getElementById("table-of-contents");
			const updates = [...document.querySelectorAll(".update")].filter((update) => update.id && !update.classList.contains("changelog-update-hidden"));
			if (!toc || updates.length === 0) return;
			const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
			let current = updates[0];
			for (const update of updates) {
				// Same line an anchor jump scrolls a date to, so a clicked date is the highlighted one.
				if (update.getBoundingClientRect().top <= parseFloat(getComputedStyle(update).scrollMarginTop) + 1) current = update;
			}
			if (atBottom) current = updates[updates.length - 1];
			let activeLink = null;
			for (const item of toc.querySelectorAll("li")) {
				const link = item.querySelector("a");
				const on = linkTarget(link) === current.id;
				if (on) activeLink = link;
				for (const attribute of ["data-active", "data-active-deepest"]) {
					if (on && item.getAttribute(attribute) !== "true") item.setAttribute(attribute, "true");
					if (!on && item.hasAttribute(attribute)) item.removeAttribute(attribute);
				}
				if (!link) continue;
				if (link.classList.contains("text-primary") !== on) link.classList.toggle("text-primary", on);
				if (link.classList.contains("dark:text-primary-light") !== on) link.classList.toggle("dark:text-primary-light", on);
				if (on && link.getAttribute("aria-current") !== "location") link.setAttribute("aria-current", "location");
				if (!on && link.hasAttribute("aria-current")) link.removeAttribute("aria-current");
			}
			const dot = toc.querySelector("span.absolute.rounded-full");
			if (dot && activeLink) {
				const style = getComputedStyle(activeLink);
				const lineHeight = parseFloat(style.lineHeight) || 1.5 * parseFloat(style.fontSize);
				const top = `${activeLink.getBoundingClientRect().top - dot.parentElement.getBoundingClientRect().top + (parseFloat(style.paddingTop) || 0) + lineHeight / 2}px`;
				if (dot.style.top !== top) dot.style.top = top;
			}
		};
		const scheduleSync = () => {
			if (!frame) frame = requestAnimationFrame(() => {
				frame = 0;
				syncToc();
			});
		};

		const rootObserver = new MutationObserver(keepScrollMt);
		rootObserver.observe(root, { attributes: true, attributeFilter: ["style"] });
		// Put the highlight back whenever Mintlify moves it.
		const tocObserver = new MutationObserver(scheduleSync);
		const toc = document.getElementById("table-of-contents");
		if (toc) tocObserver.observe(toc, { attributes: true, subtree: true, attributeFilter: ["data-active", "class", "style"] });
		const onResize = () => {
			pin();
			scheduleSync();
		};
		pin();
		scheduleSync();
		window.addEventListener("resize", onResize);
		window.addEventListener("scroll", scheduleSync, { passive: true });
		window.addEventListener("changelog-filters-change", scheduleSync);
		return () => {
			cancelAnimationFrame(frame);
			rootObserver.disconnect();
			tocObserver.disconnect();
			window.removeEventListener("resize", onResize);
			window.removeEventListener("scroll", scheduleSync);
			window.removeEventListener("changelog-filters-change", scheduleSync);
			root.style.removeProperty("--scroll-mt");
		};
	}, []);

	useEffect(() => {
		const param = new URLSearchParams(window.location.search).get("category");
		if (param) setActive(param.split(",").filter((key) => key in labels));
	}, []);

	useEffect(() => {
		const shown = (key) => active.length === 0 || active.includes(key);
		const updates = new Set();
		for (const section of document.querySelectorAll("[data-changelog-category]")) {
			section.hidden = !shown(section.dataset.changelogCategory);
			const update = section.closest(".update");
			if (update) updates.add(update);
		}
		for (const update of updates) {
			const visible = [...update.querySelectorAll("[data-changelog-category]")].some((section) => !section.hidden);
			update.classList.toggle("changelog-update-hidden", !visible);
			if (!update.id) continue;
			for (const link of document.querySelectorAll('#table-of-contents a[href^="#"]')) {
				if (linkTarget(link) === update.id) (link.closest("li") ?? link).style.display = visible ? "" : "none";
			}
		}
		window.dispatchEvent(new Event("changelog-filters-change"));
		const url = new URL(window.location.href);
		if (active.length) url.searchParams.set("category", active.join(","));
		else url.searchParams.delete("category");
		if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
	}, [active]);

	const toggle = (key) => setActive((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

	return (
		<div className="changelog-filters not-prose" role="group">
			{Object.entries(labels).map(([key, label]) => (
				<button key={key} type="button" aria-pressed={active.includes(key)} onClick={() => toggle(key)}>
					{label}
				</button>
			))}
			{active.length > 0 && (
				<button type="button" className="changelog-filters-clear" onClick={() => setActive([])}>
					{clearLabel}
				</button>
			)}
		</div>
	);
};
