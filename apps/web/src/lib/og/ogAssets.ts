// OG image fonts and wordmark, bundled into the server build. Workers have no
// filesystem, so the files are inlined by Vite (`?inline` gives a data URL)
// instead of being read with `fs` at request time.
import montserratRegularUrl from "@/app/og/profile-share/assets/Montserrat-Regular.ttf?inline";
import montserratSemiboldUrl from "@/app/og/profile-share/assets/Montserrat-SemiBold.ttf?inline";
import montserratBoldUrl from "@/app/og/profile-share/assets/Montserrat-Bold.ttf?inline";
import wordmarkLightSvg from "../../../public/wordmark_light.svg?raw";

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
	const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
	const bytes = Buffer.from(base64, "base64");
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export const montserratRegularPromise = Promise.resolve(dataUrlToArrayBuffer(montserratRegularUrl));
export const montserratSemiboldPromise = Promise.resolve(dataUrlToArrayBuffer(montserratSemiboldUrl));
export const montserratBoldPromise = Promise.resolve(dataUrlToArrayBuffer(montserratBoldUrl));
export const wordmarkDataUrlPromise = Promise.resolve(
	`data:image/svg+xml;base64,${Buffer.from(wordmarkLightSvg, "utf8").toString("base64")}`,
);
