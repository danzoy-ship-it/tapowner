import type { TraceProvider } from "./provider.js";
import { BatchDataProvider } from "./batchdata.js";

export type { TraceProvider, TraceInput, TraceResult } from "./provider.js";

export function createTraceProvider(): TraceProvider | null {
    const providerName = process.env.TRACE_PROVIDER;
    if (providerName === "batchdata") {
        const key = process.env.BATCHDATA_API_TOKEN;
        if (!key) return null;
        return new BatchDataProvider(key);
    }
    return null;
}
