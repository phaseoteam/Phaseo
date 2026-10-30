export interface AsyncJobFailureSummarySource {
	job_failure_category: string | null;
	job_failure_provider: string | null;
	job_failure_hint: string | null;
}

export function formatAsyncJobFailureSummary(
	job: AsyncJobFailureSummarySource,
): string | null {
	const parts = [
		job.job_failure_category?.trim() || null,
		job.job_failure_provider?.trim() || null,
	].filter(Boolean);
	if (parts.length > 0) return parts.join(" · ");
	return job.job_failure_hint?.trim() || null;
}
