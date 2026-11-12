/** Rasterize HTML and Recharts without nesting HTML labels inside SVG foreignObjects. */
export async function exportArtificialAnalysisChart(node: HTMLElement) {
	const { toPng } = await import("html-to-image");
	const clone = node.cloneNode(true) as HTMLElement;
	Object.assign(clone.style, { width: `${node.getBoundingClientRect().width}px`, position: "absolute", left: "0", top: "0", pointerEvents: "none", opacity: "0" });
	clone.setAttribute("aria-hidden", "true");
	document.body.appendChild(clone);
	try {
		const originals = [...node.querySelectorAll<SVGForeignObjectElement>("foreignObject")];
		const svgNamespace = "http://www.w3.org/2000/svg";
		for (const [index, foreignObject] of [...clone.querySelectorAll<SVGForeignObjectElement>("foreignObject")].entries()) {
			const original = originals[index];
			const label = original.querySelector("button") ?? original.querySelector("span[title]") ?? original;
			const direct = Boolean(original.querySelector("button"));
			const style = getComputedStyle(label);
			const x = Number(foreignObject.getAttribute("x") ?? 0), y = Number(foreignObject.getAttribute("y") ?? 0), width = Number(foreignObject.getAttribute("width") ?? 0);
			const group = document.createElementNS(svgNamespace, "g");
			const logo = [...original.querySelectorAll("img")].find((image) => getComputedStyle(image).display !== "none" && image.getBoundingClientRect().width > 0);
			if (logo) {
				const image = document.createElementNS(svgNamespace, "image");
				image.setAttribute("href", logo.currentSrc || logo.src);
				image.setAttribute("x", String(direct ? x + 4 : x + width / 2 - 8));
				image.setAttribute("y", String(y + (direct ? 4 : 0)));
				image.setAttribute("width", "16"); image.setAttribute("height", "16");
				group.appendChild(image);
			}
			const text = document.createElementNS(svgNamespace, "text");
			text.setAttribute("x", String(direct ? x + 26 : x + width / 2));
			text.setAttribute("y", String(y + (direct ? 16 : 30)));
			text.setAttribute("fill", style.color);
			text.setAttribute("font-family", style.fontFamily);
			text.setAttribute("font-size", direct ? "12" : "10");
			text.setAttribute("font-weight", "500");
			text.setAttribute("text-anchor", direct ? "start" : "middle");
			const name = label.textContent?.trim() ?? "";
			if (direct) text.textContent = name;
			else {
				const words = name.split(/\s+/), lines: string[] = [];
				const limit = Math.max(8, Math.floor(width / 5.5));
				for (const word of words) {
					if (!lines.length || `${lines.at(-1)} ${word}`.length > limit) lines.push(word);
					else lines[lines.length - 1] += ` ${word}`;
				}
				for (const [lineIndex, line] of lines.slice(0, 3).entries()) {
					const span = document.createElementNS(svgNamespace, "tspan");
					span.setAttribute("x", String(x + width / 2)); span.setAttribute("dy", lineIndex ? "12" : "0"); span.textContent = line;
					text.appendChild(span);
				}
			}
			group.appendChild(text);
			foreignObject.replaceWith(group);
		}
		return await toPng(clone, { pixelRatio: 2, style: { position: "relative", left: "0", top: "0", opacity: "1" }, backgroundColor: getComputedStyle(document.body).backgroundColor, filter: (element) => !(element instanceof HTMLElement && (element.getAttribute("role") === "tooltip" || element.hasAttribute("data-export-hide"))) });
	} finally { clone.remove(); }
}
