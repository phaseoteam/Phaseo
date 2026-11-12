/**
 * Addresses allowed to use the key. Each entry is a labelled IPv4 or IPv6 address or CIDR range. Empty allows any address.
 */
export type ApiKeyIpAllowlist = {
  address: string;
  label: string;
}[];
