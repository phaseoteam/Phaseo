import "server-only";

// The catalog assembly lives in message-catalogs.ts so build scripts can load the
// same dictionaries; server code keeps importing it through this guarded module.
export { getPublicMessages } from "./message-catalogs";
