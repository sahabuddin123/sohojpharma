// Public surface of the isolated printing module.
export * from "./types";
export {
  loadPrintingSettings,
  savePrintingSettings,
  rememberPrinter,
} from "./storage";
export { print, printViaQueue, printQueue } from "./manager";
export {
  connect as qzConnect,
  disconnect as qzDisconnect,
  reconnect as qzReconnect,
  isConnected as qzIsConnected,
} from "./qz/connection";
export {
  findPrinters as qzFindPrinters,
  findDefaultPrinter as qzFindDefaultPrinter,
} from "./qz/printer";
export { buildZplLabel } from "./qz/barcode";

// Phase 2 enterprise additions
export { detectPrinter, detectAll, type DetectedPrinter, type PrinterRole } from "./detect";
export { renderTemplate, renderMedicineLabel, type LabelTemplate, type TemplateContext } from "./templates/engine";
export { withRetry, type RetryResult } from "./retry";
export { printerHealth, type HealthSnapshot } from "./health";
export type { QueueItem, QueueStatus } from "./queue";
export {
  usePrintingSettingsRemote,
  usePrinterProfiles,
  usePrintHistory,
  usePrintQueue,
  usePrinterHealthMonitor,
  useLabelTemplates,
  useHealthHistory,
} from "./hooks";

// Phase 3 enterprise additions
export { printEvents, type PrintEvent, type PrintEventType } from "./events";
export { toCSV, downloadCSV } from "./csv";
export { runProductionValidation, type ValidationCheck, type ValidationReport } from "./validation";

// Enterprise Settings UI extras (additive, localStorage per-store)
export {
  loadExtras, saveExtras, DEFAULT_EXTRAS,
  type PrintingExtras, type RoutingPrefs, type ReceiptPrefs,
  type BarcodePrefs, type InvoicePrefs, type AutoPrintRules,
} from "./extras";
