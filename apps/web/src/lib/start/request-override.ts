// Server only. The request middleware runs the rest of the request inside this
// store with the session-refreshed request (cookies, bearer token), the way
// The request middleware can forward modified request headers to the page.
import { AsyncLocalStorage } from "node:async_hooks";

export const requestOverride = new AsyncLocalStorage<Request>();
