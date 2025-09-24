// Pyodide type declarations for Python 3.12 compatibility
declare module "pyodide" {
  export interface PyodideInterface {
    loadPackage(packages: string | string[], options?: { messageCallback?: () => void }): Promise<void>;
    runPython(code: string): any;
    pyimport(name: string): any;
    globals: any;
    registerJsModule(name: string, module: any): void;
    unpackArchive(buffer: ArrayBuffer, format: string): void;
    FS: any;
    code: {
      find_imports(code: string): string[];
    };
  }

  export function loadPyodide(options?: {
    packageBaseUrl?: string;
    stdout?: (msg: string) => void;
    stderr?: (msg: string) => void;
    [key: string]: any;
  }): Promise<PyodideInterface>;

  export const version: string;
}

export {};