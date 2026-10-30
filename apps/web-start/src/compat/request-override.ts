// Server only. The request middleware runs the rest of the request inside this
// store with the session-refreshed request (cookies, bearer token), the way
// Next middleware forwarded modified request headers to the page.
import { AsyncLocalStorage } from "node:async_hooks";

export const requestOverride = new AsyncLocalStorage<Request>();
