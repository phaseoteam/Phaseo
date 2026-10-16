import { capabilityPrivacyDecision } from "./capabilityPrivacyDecision";

const flags = { privacyZdrOnly: true, privacyEnableInputOutputLogging: true, privacyEnablePaidMayTrain: true, privacyEnableFreeMayTrain: true };
const row = { providerPolicy: { zeroDataRetention: false, dataPolicyTier: "private", dataPolicyConfidence: "confirmed" } };

describe("guardrail retention preview", () => {
    it("admits verified native routes and rejects eligibility without a guarantee", () => {
        for (const zeroDataRetention of [true, false, undefined]) {
            expect(capabilityPrivacyDecision({ ...flags, row, capability: { id: "text.generate", dataPolicy: { zeroDataRetention, zdrEligibility: "eligible" } } }).accessible).toBe(zeroDataRetention === true);
        }
    });
    it("keeps ineligible and stateful routes blocked even when a provider guarantees inference", () => {
        const guaranteed = { providerPolicy: { ...row.providerPolicy, zeroDataRetention: true } };
        expect(capabilityPrivacyDecision({ ...flags, row: guaranteed, capability: { id: "text.generate", dataPolicy: { zdrEligibility: "ineligible", zeroDataRetention: true } } }).accessible).toBe(false);
        expect(capabilityPrivacyDecision({ ...flags, row: guaranteed, capability: { id: "batch", dataPolicy: null } }).accessible).toBe(false);
        expect(capabilityPrivacyDecision({ ...flags, row: guaranteed, capability: { id: "text.generate", dataPolicy: null } }).accessible).toBe(true);
    });
});
