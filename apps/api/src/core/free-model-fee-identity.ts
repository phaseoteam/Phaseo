import { z } from "zod";

export const FreeModelReservationIdentitySchema = z.object({
    workspaceId: z.string().uuid(),
    keyId: z.string().uuid(),
    // Server-owned billing identity, never an untrusted HTTP request-id header.
    requestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
    auditRequestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/).optional(),
}).strict();
export type FreeModelReservationIdentity = z.infer<typeof FreeModelReservationIdentitySchema>;
