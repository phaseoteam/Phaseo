import { useLocalSearchParams } from "expo-router";
import { PairScreen } from "@/features/desktops/PairScreen";

export default function PairRoute() {
  // phaseo://pair?p=… (or a link pasted in Code) opens here with the payload; Desktops and Scan open it without one.
  const { p } = useLocalSearchParams<{ p?: string }>();
  return <PairScreen link={p ? `phaseo://pair?p=${p}` : undefined} />;
}
