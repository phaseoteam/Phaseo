"use client";

import Image from "next/image";
import {
	Check,
	Copy,
	Download,
	FileCode2,
	FileImage,
	Moon,
	Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
	cloneElement,
	type KeyboardEvent,
	type MouseEvent,
	type ReactElement,
	useState,
} from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const brandAssets = [
	{ key: "wordmark", file: "wordmark", width: 1441, height: 300 },
	{ key: "logo", file: "logo", width: 64, height: 64 },
] as const;

type BrandAsset = (typeof brandAssets)[number];
type AssetFormat = "svg" | "png";
type AssetAction = "copy" | "download";

type BrandMenuTriggerProps = {
	onContextMenu?: (event: MouseEvent) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
};

function assetActionKey(name: string, format: AssetFormat) {
	return `${name}-${format}`;
}

async function fetchAssetSvg(file: string, assetTheme: "light" | "dark") {
	const response = await fetch(`/${file}_${assetTheme}.svg`);
	if (!response.ok) throw new Error("Could not load brand asset");

	return response.text();
}

function svgToPng(svgText: string, width: number, height: number) {
	const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
	const imageUrl = URL.createObjectURL(svgBlob);

	return new Promise<Blob>((resolve, reject) => {
		const image = new window.Image();
		image.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");

			if (!context) {
				URL.revokeObjectURL(imageUrl);
				reject(new Error("Could not create PNG canvas"));
				return;
			}

			context.drawImage(image, 0, 0, width, height);
			canvas.toBlob((blob) => {
				URL.revokeObjectURL(imageUrl);
				if (!blob) {
					reject(new Error("Could not create PNG image"));
					return;
				}

				resolve(blob);
			}, "image/png");
		};
		image.onerror = () => {
			URL.revokeObjectURL(imageUrl);
			reject(new Error("Could not render brand asset"));
		};
		image.src = imageUrl;
	});
}

function AssetFormatMenu({
	action,
	asset,
	copiedAsset,
	onCopy,
	onDownload,
}: {
	action: AssetAction;
	asset: BrandAsset;
	copiedAsset: string | null;
	onCopy: (asset: BrandAsset, format: AssetFormat) => void;
	onDownload: (asset: BrandAsset, format: AssetFormat) => void;
}) {
	const t = useTranslations("Site.brandMenu");
	const isCopy = action === "copy";
	const ActionIcon = isCopy ? Copy : Download;
	const assetLabel = t(`assets.${asset.key}` as never);
	const menuLabel = t(
		isCopy ? "copyMenuLabel" : "downloadMenuLabel",
		{ asset: assetLabel },
	);

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger
				aria-label={menuLabel}
				title={menuLabel}
				className="flex size-7 min-h-7 justify-center p-0 [&>svg:last-child]:hidden"
			>
				<ActionIcon className="size-4" aria-hidden="true" />
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="min-w-36">
				<DropdownMenuItem
					onClick={() =>
						isCopy ? onCopy(asset, "svg") : onDownload(asset, "svg")
					}
				>
					<FileCode2 className="size-4" aria-hidden="true" />
					{t(isCopy ? "copyFormatLabel" : "downloadFormatLabel", { format: "SVG" })}
					{isCopy && copiedAsset === assetActionKey(asset.key, "svg") ? (
						<Check className="ml-auto size-4 text-emerald-500" aria-hidden="true" />
					) : null}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() =>
						isCopy ? onCopy(asset, "png") : onDownload(asset, "png")
					}
				>
					<FileImage className="size-4" aria-hidden="true" />
					{t(isCopy ? "copyFormatLabel" : "downloadFormatLabel", { format: "PNG" })}
					{isCopy && copiedAsset === assetActionKey(asset.key, "png") ? (
						<Check className="ml-auto size-4 text-emerald-500" aria-hidden="true" />
					) : null}
				</DropdownMenuItem>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function BrandMenu({
	children,
}: {
	children: ReactElement<BrandMenuTriggerProps>;
}) {
	const t = useTranslations("Site.brandMenu");
	const themeT = useTranslations("Common.theme");
	const { resolvedTheme } = useTheme();
	const [open, setOpen] = useState(false);
	const [copiedAsset, setCopiedAsset] = useState<string | null>(null);
	const [assetTheme, setAssetTheme] = useState<"light" | "dark">("light");
	const openBrandMenu = () => {
		setAssetTheme(resolvedTheme === "dark" ? "dark" : "light");
		setOpen(true);
	};
	const trigger = cloneElement(children, {
		onContextMenu: (event: MouseEvent) => {
			event.preventDefault();
			openBrandMenu();
		},
		onKeyDown: (event: KeyboardEvent) => {
			if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
				return;
			}

			event.preventDefault();
			openBrandMenu();
		},
	});

	async function copyAsset(asset: BrandAsset, format: AssetFormat) {
		try {
			const svgText = await fetchAssetSvg(asset.file, assetTheme);

			if (format === "svg") {
				if (!navigator.clipboard?.writeText) {
					throw new Error("Clipboard access is unavailable");
				}
				await navigator.clipboard.writeText(svgText);
			} else {
				if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
					throw new Error("PNG clipboard access is unavailable");
				}
				const pngBlob = await svgToPng(svgText, asset.width, asset.height);
				await navigator.clipboard.write([
					new ClipboardItem({ "image/png": pngBlob }),
				]);
			}

			setCopiedAsset(assetActionKey(asset.key, format));
			toast.success(t("copySuccess", {
				asset: t(`assets.${asset.key}` as never),
				format: format.toUpperCase(),
			}));
			window.setTimeout(() => setCopiedAsset(null), 2000);
		} catch {
			toast.error(t("copyFailure", {
				asset: t(`assets.${asset.key}` as never),
				format: format.toUpperCase(),
			}));
		}
	}

	async function downloadAsset(asset: BrandAsset, format: AssetFormat) {
		try {
			const svgText = await fetchAssetSvg(asset.file, assetTheme);
			const blob =
				format === "svg"
					? new Blob([svgText], { type: "image/svg+xml;charset=utf-8" })
					: await svgToPng(svgText, asset.width, asset.height);
			const downloadUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = downloadUrl;
			link.download = `phaseo-${asset.file}-${assetTheme}.${format}`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
			toast.success(t("downloadSuccess", {
				asset: t(`assets.${asset.key}` as never),
				format: format.toUpperCase(),
			}));
		} catch {
			toast.error(t("downloadFailure", {
				asset: t(`assets.${asset.key}` as never),
				format: format.toUpperCase(),
			}));
		}
	}

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) setOpen(false);
			}}
		>
			<DropdownMenuTrigger asChild nativeButton={false}>
				{trigger}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-[min(22rem,calc(100vw-1rem))] rounded-xl p-2"
			>
				<div className="mb-1">
					<div
						className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-900"
						role="group"
						aria-label={t("logoPreviewMode")}
					>
						<button
							type="button"
							aria-label={t("useLightLogo")}
							aria-pressed={assetTheme === "light"}
							onClick={() => setAssetTheme("light")}
							title={t("lightLogo")}
							className={`relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-zinc-500 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 dark:text-zinc-400 dark:focus-visible:ring-zinc-700 ${assetTheme === "light" ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50" : "hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"}`}
						>
							<Sun className="h-4 w-4" aria-hidden="true" />
							{themeT("light")}
						</button>
						<button
							type="button"
							aria-label={t("useDarkLogo")}
							aria-pressed={assetTheme === "dark"}
							onClick={() => setAssetTheme("dark")}
							title={t("darkLogo")}
							className={`relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-zinc-500 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 dark:text-zinc-400 dark:focus-visible:ring-zinc-700 ${assetTheme === "dark" ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50" : "hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"}`}
						>
							<Moon className="h-4 w-4" aria-hidden="true" />
							{themeT("dark")}
						</button>
					</div>
				</div>
				<div className="grid grid-cols-1 gap-2 min-[22rem]:grid-cols-2">
					{brandAssets.map((asset) => {
						const { key, file, width, height } = asset;
						const assetPath = `/${file}_${assetTheme}.svg`;
						const previewBackgroundClass = assetTheme === "dark" ? "bg-black" : "bg-white";
						const assetLabel = t(`assets.${key}` as never);

						return (
							<div
								key={key}
								className="overflow-hidden rounded-lg border bg-muted/30"
							>
								<div className={`flex h-14 items-center justify-center px-4 ${previewBackgroundClass}`}>
									<Image
										src={assetPath}
										alt={t("assetAlt", { asset: assetLabel })}
										width={width}
										height={height}
										className={file === "logo" ? "size-8" : "h-6 w-auto"}
									/>
								</div>
								<div className="flex items-center gap-1 border-t px-2 py-1.5">
									<span className="min-w-0 flex-1 truncate text-xs font-medium">
										{assetLabel}
									</span>
									<AssetFormatMenu
										action="copy"
										asset={asset}
										copiedAsset={copiedAsset}
										onCopy={(selectedAsset, format) => void copyAsset(selectedAsset, format)}
										onDownload={(selectedAsset, format) => void downloadAsset(selectedAsset, format)}
									/>
									<AssetFormatMenu
										action="download"
										asset={asset}
										copiedAsset={copiedAsset}
										onCopy={(selectedAsset, format) => void copyAsset(selectedAsset, format)}
										onDownload={(selectedAsset, format) => void downloadAsset(selectedAsset, format)}
									/>
								</div>
							</div>
						);
					})}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
