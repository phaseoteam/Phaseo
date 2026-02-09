import React, { useEffect, useState } from "react";
import { render, Text, Box } from "ink";
import type {
	CLIOptions,
	AppState,
	SimulationRun,
} from "./pricing-simulator-types";
import { simulate } from "./pricing-simulator-simulation";
import {
	renderSummaryTable,
	renderBreakdown,
	formatUsdValue,
	isFlaggedDiff,
} from "./pricing-simulator-formatting";
import { formatUsdFromNanosExact } from "../../src/pipeline/pricing/money";
import { ANSI } from "./pricing-simulator-constants";

const App: React.FC<{ options: CLIOptions }> = ({ options }) => {
	const [state, setState] = useState<AppState>({
		status: "loading",
		message: "Discovering pricing data...",
	});

	useEffect(() => {
		(async () => {
			try {
				const runs = await simulate(options);
				setState({ status: "done", runs, options });
			} catch (err) {
				setState({
					status: "error",
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		})();
	}, [options]);

	if (state.status === "loading") {
		return (
			<Box flexDirection="column">
				<Text>[loading] {state.message}</Text>
			</Box>
		);
	}

	if (state.status === "error") {
		return (
			<Box flexDirection="column">
				<Text color="red">
					Failed to simulate pricing: {state.error.message}
				</Text>
			</Box>
		);
	}

	const summaryTable = renderSummaryTable(state.runs);
	const flaggedRuns = state.runs.filter((run) => isFlaggedDiff(run.diffUsd));
	const flaggedList = flaggedRuns
		.map(
			(run) =>
				`${run.combo.provider}/${run.combo.model}/${run.combo.endpoint} [${run.plan}]`
		)
		.join(", ");

	return (
		<Box flexDirection="column">
			<Text>
				Simulated {state.runs.length} run(s) across{" "}
				{
					new Set(
						state.runs.map(
							(r) =>
								`${r.combo.provider}:${r.combo.model}:${r.combo.endpoint}:${r.plan}`
						)
					).size
				}{" "}
				provider/model/endpoint/plan combo(s).
			</Text>
			<Text>
				Plans covered:{" "}
				{Array.from(new Set(state.runs.map((r) => r.plan))).join(
					", "
				) || "none"}
			</Text>
			{flaggedRuns.length > 0 ? (
				<Text color="red">
					Flagged {flaggedRuns.length} run(s) for review -{" "}
					{flaggedList}
				</Text>
			) : (
				<Text color="green">
					All simulated runs matched estimated pricing.
				</Text>
			)}
			<Text>{summaryTable}</Text>
			<Text>Totals (USD, 9dp):</Text>
			{state.runs.map((run, idx) => {
				const diffBase =
					run.diffNanos === 0
						? "0.000000000"
						: `${
								run.diffNanos > 0 ? "+" : ""
						  }${formatUsdFromNanosExact(run.diffNanos)}`;
				const diffDecorated = isFlaggedDiff(run.diffUsd)
					? `${diffBase} (!!)`
					: diffBase;
				return (
					<Text key={`totals-${idx}`}>
						{`${run.combo.provider}/${run.combo.model}/${
							run.combo.endpoint
						} [${run.plan}] → est=${formatUsdValue(
							run.estimation.totalUsdStr,
							9
						)} billed=${formatUsdValue(
							run.engineTotalUsdStr,
							9
						)} diff=${diffDecorated}`}
					</Text>
				);
			})}
			{state.options.verbose &&
				state.runs.map((run, idx) => (
					<Box
						key={`${run.combo.provider}-${run.combo.model}-${run.combo.endpoint}-${idx}`}
						flexDirection="column"
						marginTop={1}
					>
						{(() => {
							const flagged = isFlaggedDiff(run.diffUsd);
							const billedColor = flagged ? "red" : "green";
							const diffColor = flagged ? "red" : "green";
							const diffDisplay = flagged
								? `${
										run.diffNanos > 0 ? "+" : ""
								  }${formatUsdFromNanosExact(run.diffNanos)}`
								: "0.000000000";
							const diffSuffix = flagged ? " (!!)" : "";
							return (
								<Text>
									Breakdown for {run.combo.provider}/
									{run.combo.model}/{run.combo.endpoint} [
									{run.plan}] (Estimated{" "}
									{formatUsdValue(
										run.estimation.totalUsdStr,
										9
									)}{" "}
									USD, Billed{" "}
									<Text color={billedColor}>
										{formatUsdValue(
											run.engineTotalUsdStr,
											9
										)}{" "}
										USD
									</Text>
									, Diff{" "}
									<Text color={diffColor}>
										{diffDisplay} USD
										{diffSuffix}
									</Text>
									)
								</Text>
							);
						})()}
						<Text>{renderBreakdown(run)}</Text>
					</Box>
				))}
		</Box>
	);
};

export default App;

