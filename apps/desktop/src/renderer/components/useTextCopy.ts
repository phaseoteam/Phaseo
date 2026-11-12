import { useEffect, useRef, useState } from "react";

export function useTextCopy(text: string) {
	const current = useRef({ text, version: 0 });
	if (current.current.text !== text) current.current = { text, version: current.current.version + 1 };
	const [result, setResult] = useState<{ version: number; status: "copied" | "failed" }>();
	const [copying, setCopying] = useState(false);
	const status = result?.version === current.current.version ? result.status : "idle";
	useEffect(() => { if (!result) return; const timer = setTimeout(() => setResult(undefined), 2000); return () => clearTimeout(timer); }, [result]);
	async function copy() {
		const { text: source, version } = current.current;
		setCopying(true);
		try { await navigator.clipboard.writeText(source); if (current.current.version === version) setResult({ version, status: "copied" }); }
		catch { if (current.current.version === version) setResult({ version, status: "failed" }); }
		finally { setCopying(false); }
	}
	return { status, copying, copy };
}
