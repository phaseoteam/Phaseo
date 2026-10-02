import { notFound } from "next/navigation";
import { GameHub } from "@/components/(games)/GameHub";
import { catalogueGamesEnabled } from "@/lib/games/preview";

export default async function GamesPage() {
  if (!(await catalogueGamesEnabled())) notFound();
  return <GameHub />;
}
