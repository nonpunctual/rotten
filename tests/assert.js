let passed = 0;
let failed = 0;

export function eq(actual, expected, name) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        passed++;
        print(`ok ${name}`);
    } else {
        failed++;
        print(`FAIL ${name}\n    expected: ${e}\n    actual:   ${a}`);
    }
}

export function done() {
    print(`${passed} passed, ${failed} failed`);
    if (failed > 0) {
        throw new Error(`${failed} failed`);
    }
}
