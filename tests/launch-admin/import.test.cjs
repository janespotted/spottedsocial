const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const ts = require("../../mobile/node_modules/typescript");
const source = ts.transpileModule(
  fs.readFileSync(
    require("node:path").join(__dirname, "../../src/launch-admin/types.ts"),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exportsObj = {};
vm.runInNewContext(source, { exports: exportsObj });
const { parseGuestImport, normalizePhone, csvCell } = exportsObj;
test("Pasted and CSV guest lists normalize without losing quoted names", () => {
  const rows = parseGuestImport(
    'phone,name\n"+1 (202) 555-0101","Morgan, Alex"\n2025550102,Sam Chen',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].phone, "+12025550101");
  assert.equal(rows[0].name, "Morgan, Alex");
  assert.equal(rows[1].phone, "+12025550102");
});
test("Name-first columns and international numbers are accepted", () => {
  const r = parseGuestImport("Alex,+44 7700 900123");
  assert.equal(r[0].phone, "+447700900123");
  assert.equal(r[0].name, "Alex");
});
test("Ambiguous numbers, invalid rows and oversized imports are rejected", () => {
  assert.equal(normalizePhone("020 1234 5678"), null);
  assert.throws(() => parseGuestImport("Name,not a phone"));
  assert.throws(() =>
    parseGuestImport(Array(502).fill("+12025550101").join("\n")),
  );
});
test("CSV export neutralizes spreadsheet formula injection and preserves quotes", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("+12025550101"), '"\'+12025550101"');
});
