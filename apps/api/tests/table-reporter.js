import { table } from "@visulima/tabular";

export default class TableReporter {
    constructor() {
        this.results = [];
    }

    onTestCaseResult(testCase) {
        const state = testCase?.result?.state || "unknown";
        this.results.push({
            name: testCase?.name || "unknown",
            state,
            duration: Math.round(testCase?.result?.duration || 0),
        });
    }

    onFinished() {
        if (!this.results.length) return;
        const rows = [
            ["Status", "Test", "Duration(ms)"],
            ...this.results.map((r) => [
                r.state === "pass" ? "OK" : r.state === "fail" ? "X" : "SKIP",
                r.name,
                String(r.duration),
            ]),
        ];
        console.log("\nTest Summary");
        console.log(table(rows));
    }
}
