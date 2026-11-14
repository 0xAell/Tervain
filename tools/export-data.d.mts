export interface ExportedFile {
  path: string;
  text?: string;
  png?: { width: number; height: number; bitDepth: 8 | 16; samples: Uint8Array | Uint16Array };
}
export function encodePng(width: number, height: number, bitDepth: 8 | 16, samples: Uint8Array | Uint16Array): Buffer;
export function decodePng(file: Buffer): { width: number; height: number; bitDepth: number; samples: Uint8Array | Uint16Array };
export function buildExport(load: (id: string) => Promise<any>): Promise<ExportedFile[]>;
export function differences(files: ExportedFile[], directory?: string): string[];
