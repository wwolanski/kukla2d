import {
  analyzeTypeLocality,
  formatTypeLocalityReport,
} from "./type-locality.mjs";

let diagnostics;
try {
  diagnostics = analyzeTypeLocality();
} catch (error) {
  console.error(
    `Type locality check could not start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

if (diagnostics?.length === 0) {
  console.log("Type locality: no violations");
} else if (diagnostics) {
  process.stderr.write(`${formatTypeLocalityReport(diagnostics)}\n`);
  process.exitCode = 1;
}
