import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import type { ChatAttachment } from "./types";

const MAX_TEXT_BYTES = 200 * 1024;
const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|csv|x-sh|sql|toml))/;

function attachmentsDir() {
  const dir = new Directory(Paths.document, "chat-attachments");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies a picked file into app storage so the chat keeps it after the picker's cache is cleared. */
function keep(uri: string, name: string, mimeType: string, kind: ChatAttachment["kind"], size?: number): ChatAttachment {
  const id = Crypto.randomUUID();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : kind === "image" ? ".jpg" : kind === "audio" ? ".mp3" : ".txt";
  const target = new File(attachmentsDir(), `${id}${extension}`);
  new File(uri).copy(target);
  return { id, kind, name, mimeType, uri: target.uri, size };
}

export async function pickImages(source: "library" | "camera"): Promise<ChatAttachment[]> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, allowsMultipleSelection: source === "library", selectionLimit: 4, exif: false };
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Allow camera access for Phaseo in your phone's settings to take a photo.");
  }
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return result.assets.map((asset) => keep(asset.uri, asset.fileName ?? "photo.jpg", asset.mimeType ?? "image/jpeg", "image", asset.fileSize));
}

/** Text files (code, notes, CSV, JSON) go into the message as text. */
export async function pickTextFile(): Promise<ChatAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["text/*", "application/json", "application/xml", "text/csv"], copyToCacheDirectory: true, multiple: true });
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    const mimeType = asset.mimeType ?? "text/plain";
    if (!TEXT_TYPES.test(mimeType) && !/\.(md|txt|csv|json|ya?ml|ts|tsx|js|py|go|rs|java|kt|swift|sql|sh|toml|xml|html|css)$/i.test(asset.name)) throw new Error(`${asset.name} isn't a text file. Attach photos, text or code files, or audio.`);
    if ((asset.size ?? 0) > MAX_TEXT_BYTES) throw new Error(`${asset.name} is over 200 KB. Attach a smaller file.`);
    return keep(asset.uri, asset.name, mimeType, "text", asset.size ?? undefined);
  });
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Audio files go to the model as input_audio, for models that take audio. */
export async function pickAudioFile(): Promise<ChatAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["audio/*"], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    if ((asset.size ?? 0) > MAX_AUDIO_BYTES) throw new Error(`${asset.name} is over 10 MB. Attach a shorter recording.`);
    return keep(asset.uri, asset.name, asset.mimeType ?? "audio/mpeg", "audio", asset.size ?? undefined);
  });
}

export function removeAttachmentFiles(attachments: ChatAttachment[]) {
  for (const attachment of attachments) {
    try { new File(attachment.uri).delete(); } catch { /* already gone */ }
  }
}
