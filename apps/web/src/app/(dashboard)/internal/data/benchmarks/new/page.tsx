import Link from "next/link";
import { createBenchmarkAction } from "../../actions";

export default function NewBenchmarkPage() {
	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Create benchmark</h1>
			</div>
			<form action={createBenchmarkAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Benchmark ID</div>
						<input name="id" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Name</div>
						<input name="name" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Category</div>
						<input name="category" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Scoring order</div>
						<select name="ascending_order" className="w-full rounded-md border px-3 py-2 text-sm">
							<option value="">Default</option>
							<option value="higher">Higher is better</option>
							<option value="lower">Lower is better</option>
						</select>
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Link</div>
						<input name="link" type="url" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						Create
					</button>
					<Link href="/internal/data/benchmarks" className="rounded-md border px-3 py-2 text-sm">
						Cancel
					</Link>
				</div>
			</form>
		</div>
	);
}

