import assert from "node:assert/strict";
import { testingExports } from "./run-internal";

function main(): void {
    const baseUrl = "https://huggingface.co/api/models?author=openai&limit=100";

    assert.equal(
        testingExports.parseNextLink(
            '</api/models?author=openai&limit=100&cursor=abc>; rel="next"',
            baseUrl
        ),
        "https://huggingface.co/api/models?author=openai&limit=100&cursor=abc"
    );

    assert.equal(
        testingExports.parseNextLink(
            '<https://huggingface.co/api/models?author=openai&limit=100&cursor=def>; rel="next"',
            baseUrl
        ),
        "https://huggingface.co/api/models?author=openai&limit=100&cursor=def"
    );

    assert.equal(
        testingExports.parseNextLink(
            '<https://attacker.example/collect>; rel="next"',
            baseUrl
        ),
        null
    );

    assert.equal(
        testingExports.parseNextLink(
            '<https://huggingface.co/api/spaces?author=openai>; rel="next"',
            baseUrl
        ),
        null
    );
}

main();
