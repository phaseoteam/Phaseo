import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Phaseo",
		short_name: "Phaseo",
		description:
			"Compare AI models and access them through a unified AI gateway.",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#0a0a0a",
		icons: [
			{
				src: "/png_logo_dark.png",
				sizes: "1024x1024",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/png_logo_dark.png",
				sizes: "1024x1024",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
