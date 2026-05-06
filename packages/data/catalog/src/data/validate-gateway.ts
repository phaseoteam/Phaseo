import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWebDataValidation } from './validate';

const GATEWAY_ERROR_PATTERN = /active on gateway but no rules/i;

function logGatewayErrors(errors: string[]) {
    console.error(`Gateway validation failed for ${errors.length} pricing entr${errors.length === 1 ? 'y' : 'ies'}:`);
    for (const err of errors) {
        console.error(` - ${err}`);
    }
}

function runGatewayValidation() {
    const outcome = runWebDataValidation({ gatingSections: ['pricing'] });
    const pricingResult = outcome.results.find((result) => result.key === 'pricing');
    if (!pricingResult) {
        console.error('Unable to locate pricing results from data validation run.');
        process.exit(1);
    }
    const gatewayErrors = pricingResult.errors.filter((error) => GATEWAY_ERROR_PATTERN.test(error));
    if (gatewayErrors.length > 0) {
        logGatewayErrors(gatewayErrors);
        process.exit(1);
    }
    console.log('Gateway validation passed. All active gateway models include pricing rules.');
}

const VALIDATE_GATEWAY_SCRIPT_PATH = path.resolve(fileURLToPath(import.meta.url));
const CLI_ENTRY_PATH = process.argv[1] ? path.resolve(process.argv[1]) : null;
const IS_DIRECT_CLI_RUN = CLI_ENTRY_PATH === VALIDATE_GATEWAY_SCRIPT_PATH;

if (IS_DIRECT_CLI_RUN) {
    runGatewayValidation();
}
