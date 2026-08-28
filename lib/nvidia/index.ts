// Adapter entry-point for the NVIDIA subsystem. UI / routes import from here
// only — the model selection, key retrieval, and schema validation are
// encapsulated so swapping the NIM model never touches call sites.

export * from "./models";
export * from "./schemas";
export * from "./client";
export { writeSocialPackage, writeStandalonePost, NvidiaContentError, type ContentWriterInput, type ContentWriterResult, type StandalonePostInput } from "./content-writer";
export { runMonitor, NvidiaMonitorError, type AdMetric, type MonitorInput } from "./monitor";
