/**
 * Where you keep this key, such as the hosting platform whose environment variables hold it. Optional. If one of these places reports a breach, you can find and revoke every key stored there. Known ids: railway, vercel, netlify, render, fly, heroku, cloudflare, supabase, firebase, digitalocean, replit, modal, convex, koyeb, coolify, northflank, expo, deno-deploy, aws, google-cloud, azure, hetzner, vultr, linode, ovhcloud, scaleway, kubernetes, github, gitlab, circleci, bitbucket, 1password, bitwarden, hashicorp-vault, doppler, infisical, local-machine, own-server, other.
 */
export type ApiKeyStorageLocations = string[];
