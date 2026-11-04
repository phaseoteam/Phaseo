/** A local web server a chat started, listed in the chat's details with Open and Stop. */
export type ThreadServer = { port: number; url: string; pid: number; process?: string; /** The terminal or background command it runs under. */ startedBy: string };
