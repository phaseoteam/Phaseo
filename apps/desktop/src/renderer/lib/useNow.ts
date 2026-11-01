import { useEffect, useState } from "react";

/** The time, refreshed on an interval, for labels that age without new data (a silent turn, a reset time). */
export function useNow(interval = 30_000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => { const timer = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(timer); }, [interval]);
	return now;
}
