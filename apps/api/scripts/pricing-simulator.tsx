#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { parseArgv, printHelpAndExit } from "./pricing-simulator-cli";
import App from "./pricing-simulator-app";

function main() {
	try {
		const options = parseArgv(process.argv.slice(2));
		render(<App options={options} />);
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		console.error(error.message);
		process.exit(1);
	}
}

main();
