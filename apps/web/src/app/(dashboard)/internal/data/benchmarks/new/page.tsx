import { BenchmarkForm } from "@/components/(data)/BenchmarkForm";
import { createBenchmarkAction } from "../../actions";

export default function NewBenchmarkPage() {
  return <div className="container mx-auto space-y-8 py-8"><h1 className="text-2xl font-semibold">Create benchmark</h1><BenchmarkForm action={createBenchmarkAction} /></div>;
}
