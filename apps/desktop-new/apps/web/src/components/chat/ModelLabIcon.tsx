import { useState } from "react";
import { logoManifest } from "../../../../../../../apps/web/src/lib/logos/manifest";
import type { ModelEsque } from "./providerIconUtils";
import { cn } from "~/lib/utils";

/** Use the same lab identity and theme-specific assets as Phaseo web. */
export function ModelLabIcon({ model }: { model: ModelEsque }) {
  const lab = model.slug.includes("/") ? model.slug.split("/")[0]! : model.subProvider ?? "";
  const normalized = lab.toLowerCase().replace(/[^a-z0-9]/g, "");
  const assets = Object.entries(logoManifest).find(([id]) => id.replace(/[^a-z0-9]/g, "") === normalized)?.[1] as
    { color?: string; light?: string; dark?: string } | undefined;
  const light = assets?.color ?? assets?.light ?? assets?.dark;
  const dark = assets?.color ?? assets?.dark ?? assets?.light;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!light || !dark) return null;
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden>
      {[{ src: light, theme: "light" }, { src: dark, theme: "dark" }].map(({ src, theme }) => (
        <img
          key={theme}
          src={`https://phaseo.app${src}`}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(src)}
          className={cn("size-4 object-contain", theme === "light" ? "dark:hidden" : "hidden dark:block", failedSource === src && "invisible")}
        />
      ))}
    </span>
  );
}
