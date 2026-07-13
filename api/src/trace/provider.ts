export interface TracePhone {
    number: string;
    type: string;
    carrier?: string;
    dnc: boolean;
    tcpa: boolean;
}

export interface TraceEmail {
    email: string;
}

export interface TraceResult {
    matched: boolean;
    ownerName: string | null;
    phones: TracePhone[];
    emails: TraceEmail[];
    matchQuality: string;
}

export interface TraceInput {
    apn: string | null;
    countyFips: string | null;
    ownerName: string | null;
    situsAddress: string;
    situsCity: string;
    situsState: string;
    situsZip: string;
}

export interface TraceProvider {
    trace(input: TraceInput): Promise<TraceResult>;
}
