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
        console.log(renderTable(rows));
    }
}

function renderTable(rows) {
    const widths = rows[0].map((_, columnIndex) => {
        let width = 0;
        for (const row of rows) {
            const value = String(row[columnIndex] ?? "");
            if (value.length > width) width = value.length;
        }
        return width;
    });

    const separator = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;
    const formatRow = (row) => `| ${row.map((cell, index) => String(cell ?? "").padEnd(widths[index], " ")).join(" | ")} |`;

    const lines = [separator, formatRow(rows[0]), separator];
    for (let i = 1; i < rows.length; i += 1) {
        lines.push(formatRow(rows[i]));
    }
    lines.push(separator);

    return lines.join("\n");
}
