type InvoiceRunSummary = {
	processed: number;
	issued: number;
	skippedZero: number;
	failed: number;
};

export async function runWorkspaceInvoicingJob(args?: {
	scheduledAtIso?: string;
}): Promise<InvoiceRunSummary> {
	void args;
	return {
		processed: 0,
		issued: 0,
		skippedZero: 0,
		failed: 0,
	};
}

// Backwards-compatible export name for existing call sites.
export const runEnterpriseInvoicingJob = runWorkspaceInvoicingJob;
