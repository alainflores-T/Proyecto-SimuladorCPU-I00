"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var raiz = path.resolve(__dirname, "..");
var archivos = [
  "src/Estado.gs",
  "src/Cache.gs",
  "src/Memoria.gs",
  "src/ES.gs",
  "src/CPU.gs",
  "src/Ensamblador.gs",
  "src/Pruebas.gs",
  "src/Main.gs"
];

var prohibido = /openById|UrlFetchApp|DriveApp|newTrigger|doGet\s*\(|doPost\s*\(|ScriptApp\.getOAuthToken|Class\s+/;
var i;
for (i = 0; i < archivos.length; i++) {
  var texto = fs.readFileSync(path.join(raiz, archivos[i]), "utf8");
  if (prohibido.test(texto)) {
    console.error("API o construcción prohibida en " + archivos[i]);
    process.exit(1);
  }
}

var manifiesto = JSON.parse(fs.readFileSync(path.join(raiz, "appsscript.json"), "utf8"));
var ambitos = manifiesto.oauthScopes || [];
var esperados = [
  "https://www.googleapis.com/auth/spreadsheets.currentonly",
  "https://www.googleapis.com/auth/script.container.ui"
];
if (ambitos.length !== esperados.length || esperados.some(function (s) { return ambitos.indexOf(s) < 0; })) {
  console.error("El manifiesto no queda en la hoja actual y el diálogo del contenedor.");
  process.exit(1);
}
if (manifiesto.webapp || manifiesto.urlFetchWhitelist || manifiesto.executionApi) {
  console.error("El manifiesto abre web app, UrlFetch o execution API.");
  process.exit(1);
}

var contexto = {
  console: console,
  Math: Math,
  parseInt: parseInt,
  isNaN: isNaN,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  Error: Error,
  JSON: JSON,
  RegExp: RegExp
};
vm.createContext(contexto);
for (i = 0; i < archivos.length; i++) {
  var codigo = fs.readFileSync(path.join(raiz, archivos[i]), "utf8");
  vm.runInContext(codigo, contexto, { filename: archivos[i] });
}

var resultado = contexto.simProbarTodo();
console.log("casos=" + resultado.total + " fallos=" + resultado.fallos.length);
if (resultado.fallos.length) {
  console.log(resultado.fallos.join("\n"));
  process.exit(1);
}
vm.runInContext(fs.readFileSync(path.join(raiz, "test/setup-hoja.js"), "utf8"), contexto, { filename: "test/setup-hoja.js" });
var setup;
try {
  setup = contexto.simProbarSetupHoja();
} catch (err) {
  console.error("setup excepción " + (err && err.stack ? err.stack : err));
  process.exit(1);
}
console.log("setup fallos=" + setup.fallos.length);
if (setup.fallos.length) {
  console.log(setup.fallos.join("\n"));
  process.exit(1);
}
console.log("ok");
