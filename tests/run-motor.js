"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail || "" });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : ""));
}

function colNum(letters) {
  let n = 0;
  letters = String(letters).toUpperCase();
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}
function colLetters(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function parseA1(a1) {
  const m = String(a1).trim().match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!m) throw new Error("A1 inválida " + a1);
  const r1 = parseInt(m[2], 10);
  const c1 = colNum(m[1]);
  if (!m[3]) return { r: r1, c: c1, rows: 1, cols: 1 };
  const r2 = parseInt(m[4], 10);
  const c2 = colNum(m[3]);
  return { r: r1, c: c1, rows: r2 - r1 + 1, cols: c2 - c1 + 1 };
}

function makeBook() {
  const sheets = {};
  function makeSheet(name) {
    const cells = {};
    function key(r, c) { return r + "," + c; }
    function cell(r, c) {
      const k = key(r, c);
      if (!cells[k]) cells[k] = { v: "", note: "", bg: null, fmt: "", formula: "" };
      return cells[k];
    }
    function range(r, c, rows, cols) {
      const api = {
        getValue() { return cell(r, c).v; },
        setValue(v) {
          for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) cell(r + i, c + j).v = v;
          return api;
        },
        getValues() {
          const out = [];
          for (let i = 0; i < rows; i++) {
            const row = [];
            for (let j = 0; j < cols; j++) row.push(cell(r + i, c + j).v);
            out.push(row);
          }
          return out;
        },
        setValues(matrix) {
          for (let i = 0; i < matrix.length; i++) {
            for (let j = 0; j < matrix[i].length; j++) cell(r + i, c + j).v = matrix[i][j];
          }
          return api;
        },
        getNote() { return cell(r, c).note; },
        setNote(n) { cell(r, c).note = n == null ? "" : String(n); return api; },
        getFormula() { return cell(r, c).formula; },
        setFormula(f) { cell(r, c).formula = f || ""; return api; },
        getBackground() { return cell(r, c).bg; },
        setBackground(color) {
          for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) cell(r + i, c + j).bg = color;
          return api;
        },
        getNumberFormat() { return cell(r, c).fmt; },
        setNumberFormat(f) {
          for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) cell(r + i, c + j).fmt = f;
          return api;
        },
        setFontWeight() { return api; },
        setFontColor() { return api; },
        setFontFamily() { return api; },
        setFontSize() { return api; },
        setHorizontalAlignment() { return api; },
        setBorder() { return api; },
        setDataValidation() { return api; },
        clearContent() { return api.setValue(""); },
        clear() { return api.setValue(""); }
      };
      return api;
    }
    const sheet = {
      getName() { return name; },
      getRange(a, b, c, d) {
        if (typeof a === "string") {
          const box = parseA1(a);
          return range(box.r, box.c, box.rows, box.cols);
        }
        return range(a, b, c || 1, d || 1);
      },
      setColumnWidth() {},
      getColumnWidth() { return 80; },
      getLastRow() {
        let max = 0;
        Object.keys(cells).forEach(function (k) {
          if (cells[k].v !== "" && cells[k].v != null) max = Math.max(max, parseInt(k.split(",")[0], 10));
        });
        return max;
      },
      getLastColumn() {
        let max = 0;
        Object.keys(cells).forEach(function (k) {
          if (cells[k].v !== "" && cells[k].v != null) max = Math.max(max, parseInt(k.split(",")[1], 10));
        });
        return max;
      },
      appendRow(values) {
        const row = sheet.getLastRow() + 1;
        values.forEach(function (v, i) { cell(row, i + 1).v = v; });
      },
      clear() { Object.keys(cells).forEach(function (k) { delete cells[k]; }); },
      insertRowBefore() {},
      setFrozenRows() {},
      getCharts() { return []; }
    };
    return sheet;
  }
  const book = {
    getSheetByName(n) { return sheets[n] || null; },
    insertSheet(n) {
      if (!sheets[n]) sheets[n] = makeSheet(n);
      return sheets[n];
    },
    getActiveSheet() { return book.insertSheet("Hoja 1"); },
    setActiveSheet() {}
  };
  book.insertSheet("Hoja 1");
  return book;
}

const store = {};
const alerts = [];
const book = makeBook();
const menu = { addItem() { return menu; }, addSeparator() { return menu; }, addToUi() { return menu; } };
const ui = {
  alert(msg) { alerts.push(String(msg)); },
  createMenu() { return menu; },
  showSidebar() {}
};
const validation = {
  requireValueInList() { return validation; },
  setAllowInvalid() { return validation; },
  build() { return {}; }
};
const sandbox = {
  console: console,
  store: store,
  book: book,
  alerts: alerts,
  MOTOR_PULSO_MS: 0,
  SpreadsheetApp: {
    getActiveSpreadsheet() { return book; },
    getUi() { return ui; },
    flush() {},
    newDataValidation() { return validation; },
    BorderStyle: { SOLID_MEDIUM: "SOLID_MEDIUM" }
  },
  PropertiesService: {
    getDocumentProperties() {
      return {
        getProperty(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setProperty(k, v) { store[k] = String(v); },
        deleteProperty(k) { delete store[k]; }
      };
    }
  },
  Utilities: {
    sleep() {},
    formatDate() { return "00:00:00"; }
  },
  Session: { getScriptTimeZone() { return "UTC"; } },
  Logger: { log() {} },
  HtmlService: {
    createHtmlOutputFromFile() {
      return { setTitle() { return this; }, setWidth() { return this; } };
    }
  },
  fs: fs,
  path: path,
  root: root,
  results: results
};
vm.createContext(sandbox);
const names = fs.readdirSync(srcDir).filter(function (f) { return f.endsWith(".gs"); }).sort();
const ordered = ["Config.gs"].concat(names.filter(function (f) { return f !== "Config.gs"; }));
ordered.forEach(function (name) {
  vm.runInContext(fs.readFileSync(path.join(srcDir, name), "utf8"), sandbox, { filename: name });
});

function run(code) {
  return vm.runInContext(code, sandbox, { filename: "test-body.js" });
}

// Sintaxis de cada .gs como script JS.
let syntaxFail = 0;
names.forEach(function (name) {
  const tmp = path.join("/tmp", "syntax-" + name + ".js");
  fs.writeFileSync(tmp, fs.readFileSync(path.join(srcDir, name)));
  const r = require("child_process").spawnSync("node", ["--check", tmp], { encoding: "utf8" });
  if (r.status !== 0) {
    syntaxFail++;
    console.log("SYNTAX " + name + " " + (r.stderr || "").split("\n").slice(-2).join(" "));
  }
});
check("sintaxis de todos los .gs", syntaxFail === 0, "fallos=" + syntaxFail);

const body = fs.readFileSync(path.join(__dirname, "motor-body.js"), "utf8");
try {
  vm.runInContext(body, sandbox, { filename: "motor-body.js" });
} catch (e) {
  console.error("BODY THREW\n" + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
}
const fails = (sandbox.results || []).filter(function (r) { return !r.ok; });
console.log("SUMMARY body " + ((sandbox.results || []).length - fails.length) + "/" + (sandbox.results || []).length);
fs.writeFileSync(path.join(__dirname, "motor-results.json"), JSON.stringify({ syntaxFail: syntaxFail, results: sandbox.results || [], alerts: alerts.slice(0, 12) }, null, 2));
if (syntaxFail || fails.length || process.exitCode) process.exitCode = 1;
