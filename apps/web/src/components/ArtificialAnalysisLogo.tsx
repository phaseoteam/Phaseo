import Image from "next/image";
export function ArtificialAnalysisLogo({ size = 28 }: { size?: number }) {
  return <span className="inline-flex shrink-0" aria-hidden="true">
    <Image src="/benchmarks/artificial-analysis_light.svg" alt="" width={size} height={size} className="dark:hidden" />
    <Image src="/benchmarks/artificial-analysis_dark.svg" alt="" width={size} height={size} className="hidden dark:block" />
  </span>;
}
