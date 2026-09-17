declare module 'hl7-standard' {
  export interface HL7Segment {
    get(path: string): unknown;
    set(path: string, value: unknown): void;
  }

  export default class HL7 {
    constructor(rawHl7: string);
    transform(callback?: (err: Error | null) => void): void;
    get(path: string): unknown;
    set(path: string, value: unknown): void;
    getSegment(name: string): HL7Segment | null;
    getSegments(name: string): HL7Segment[];
    build(): string;
  }
}
