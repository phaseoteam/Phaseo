import type { ProviderProfile } from "@shared/types";
import { resolveDesktopLogo } from "@renderer/lib/logos";

interface LogoProps {
  provider: ProviderProfile;
  size?: number;
  className?: string;
}

export function Logo({ provider, size = 18, className = "" }: LogoProps) {
  const light = resolveDesktopLogo(provider, "light");
  const dark = resolveDesktopLogo(provider, "dark");

  if (!light.src && !dark.src) {
    return (
      <span
        aria-hidden="true"
        className={`provider-logo provider-logo-fallback ${className}`.trim()}
        style={{ width: size, height: size }}
      />
    );
  }

  const alt = light.label || dark.label || provider.name;

  if (light.src && dark.src && light.src === dark.src) {
    return (
      <img
        src={light.src}
        alt={alt}
        width={size}
        height={size}
        className={`provider-logo ${className}`.trim()}
      />
    );
  }

  return (
    <>
      {light.src ? (
        <img
          src={light.src}
          alt={alt}
          width={size}
          height={size}
          className={`provider-logo provider-logo-light ${className}`.trim()}
        />
      ) : null}
      {dark.src ? (
        <img
          src={dark.src}
          alt={alt}
          width={size}
          height={size}
          className={`provider-logo provider-logo-dark ${className}`.trim()}
        />
      ) : null}
    </>
  );
}
