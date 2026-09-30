// Jest en modo ESM nativo (el proyecto es "type": "module").
// Se ejecuta con `node --experimental-vm-modules ... jest` (ver package.json).
// transform: {} desactiva Babel para que Jest trate los .js como ESM tal cual.
export default {
  transform: {},
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js", "**/*.test.js"]
};
