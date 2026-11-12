import { GameHub } from "@/components/(games)/GameHub";

// The catalogueGamesEnabled() gate runs in the route's beforeLoad (page.functions.ts).
export default function GamesPage() {
  return <GameHub />;
}
