import type { Metadata } from "next";
import { OpenUIExperiment } from "@/components/(chat)/openui/OpenUIExperiment";

export const metadata: Metadata = {
  title: "OpenUI experiment",
  robots: { index: false, follow: false },
};

export default function OpenUIExperimentPage() {
  return <OpenUIExperiment />;
}
