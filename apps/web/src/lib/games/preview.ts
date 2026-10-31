import { catalogueGamesPreviewFlag } from "@/lib/flags";

export async function catalogueGamesEnabled(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  return catalogueGamesPreviewFlag();
}
