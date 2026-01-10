import fs from "node:fs/promises";
import path from "node:path";

export async function imageToBase64(imagePath: string): Promise<string> {
    const absolutePath = path.resolve(imagePath);
    const buffer = await fs.readFile(absolutePath);
    const base64 = buffer.toString("base64");
    const mimeType = getMimeType(absolutePath);
    return `data:${mimeType};base64,${base64}`;
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
    };
    return mimeTypes[ext] || "application/octet-stream";
}

export function base64ToMimeType(base64DataUrl: string): string {
    const match = base64DataUrl.match(/^data:([^;]+);base64,/);
    return match ? match[1] : "application/octet-stream";
}
