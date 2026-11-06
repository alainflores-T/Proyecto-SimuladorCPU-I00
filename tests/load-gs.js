const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadGs(context, filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInContext(code, context, { filename: filePath });
}

function createTestContext() {
  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet() { throw new Error("SpreadsheetApp is not available in Node"); },
      getUi() { return { alert() {} }; },
      newDataValidation() {
        return { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } };
      }
    }
  };
  vm.createContext(context);
  const root = path.join(__dirname, "..");
  loadGs(context, path.join(root, "src/Assembler.gs"));
  loadGs(context, path.join(root, "src/Disassembler.gs"));
  return context;
}

module.exports = { createTestContext, loadGs };
