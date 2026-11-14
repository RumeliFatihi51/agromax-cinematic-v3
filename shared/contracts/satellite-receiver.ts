export interface ReceiverProduct {
  readonly mission: string;
  readonly product: string;
  readonly capturedAt: string;
  readonly format: string;
  readonly sha256: string;
  readonly content: ReadableStream<Uint8Array>;
}

// A trusted relay can implement this contract after receiver and decoder validation.
export interface SatelliteReceiver {
  read(signal: AbortSignal): AsyncIterable<ReceiverProduct>;
}
