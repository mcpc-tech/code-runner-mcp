// DOM type definitions for Pyodide compatibility
/// <reference lib="dom" />

declare global {
  interface HTMLCanvasElement extends Element {
    width: number;
    height: number;
    getContext(contextId: "2d"): any | null;
    getContext(contextId: "webgl" | "experimental-webgl"): any | null;
    getContext(contextId: string): any | null;
    toDataURL(type?: string, quality?: number): string;
    toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
  }

  interface FileSystemDirectoryHandle {
    readonly kind: "directory";
    readonly name: string;
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  }

  interface FileSystemFileHandle {
    readonly kind: "file";
    readonly name: string;
    getFile(): Promise<File>;
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream {
    write(data: BufferSource | Blob | string): Promise<void>;
    close(): Promise<void>;
  }

  interface FileSystemHandle {
    readonly kind: "file" | "directory";
    readonly name: string;
  }

  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};