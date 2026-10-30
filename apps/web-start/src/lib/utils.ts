export { cn } from "cn"

export function isExternalLink(href: string): boolean {
  if (!href) return false
  const lower = href.toLowerCase()
  if (lower.startsWith("/") || lower.startsWith("#")) return false
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("//") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  )
}
