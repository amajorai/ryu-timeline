import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	namedAssertionIsPresent,
	reconcileLocalInteractionMap,
} from "../../../../apps-store/companion-suite.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "../../..");
const inventoryPath = path.join(
	repositoryRoot,
	"docs/proof/test-coverage-sweep-20260924/companion-interaction-inventory.tsv"
);
const mapPath = path.join(import.meta.dirname, "companion-interactions.json");
const specPath = path.join(import.meta.dirname, "timeline-companion.spec.ts");
const map = JSON.parse(readFileSync(mapPath, "utf8"));

function currentTimelineRows() {
	const lines = readFileSync(inventoryPath, "utf8").trim().split(/\r?\n/);
	const headers = lines[0].split("\t");
	return lines
		.slice(1)
		.map((line) => {
			const fields = line.split("\t");
			return Object.fromEntries(
				headers.map((header, index) => [header, fields[index] ?? ""])
			);
		})
		.filter((row) => row.package === "timeline");
}

describe("Timeline rendered interaction map", () => {
	test("every current Timeline census row has one exact rendered assertion", () => {
		const rows = currentTimelineRows();
		const reconciled = reconcileLocalInteractionMap("timeline", rows, map);
		expect(map.expectedRows).toBe(30);
		expect(reconciled).toHaveLength(30);
		expect(new Set(reconciled.map(({ row }) => row.line)).size).toBe(30);

		const specSource = readFileSync(specPath, "utf8");
		const missingAssertions = [];
		for (const { assertion } of reconciled) {
			if (
				!namedAssertionIsPresent(
					specSource,
					assertion.testTitle,
					assertion.assertionMarker
				)
			) {
				missingAssertions.push({
					assertionName: assertion.assertionName,
					assertionMarker: assertion.assertionMarker,
					testTitle: assertion.testTitle,
				});
			}
		}
		expect(missingAssertions).toEqual([]);
	});

	test("a complete map rejects omitted and duplicate interactions", () => {
		const rows = currentTimelineRows();
		expect(() =>
			reconcileLocalInteractionMap("timeline", rows, {
				...map,
				assertions: map.assertions.slice(0, -1),
			})
		).toThrow("expected 30 rows but contains 29");
		expect(() =>
			reconcileLocalInteractionMap("timeline", rows, {
				...map,
				assertions: [...map.assertions, map.assertions[0]],
				expectedRows: 31,
				scope: "partial",
			})
		).toThrow("duplicates an interaction identity");
	});
});
