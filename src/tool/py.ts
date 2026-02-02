import {
  loadPyodide,
  type PyodideConfig,
  type PyodideInterface,
  version as pyodideVersion,
} from "pyodide";
import process from "node:process";
import envPaths from "env-paths";

let pyodideInstance: Promise<PyodideInterface> | null = null;

// Get system cache directory for pyodide packages
const paths = envPaths("pyodide", { suffix: "" });

/**
 * Get or initialize the Pyodide instance.
 *
 * Note: Pyodide is a singleton. The `config` parameter only takes effect
 * on the first call. Subsequent calls will return the existing instance
 * and ignore any config passed.
 *
 * @param config Optional Pyodide configuration (only used on first initialization)
 */
// deno-lint-ignore require-await
export const getPyodide = async (
  config?: PyodideConfig,
): Promise<PyodideInterface> => {
  if (!pyodideInstance) {
    // Support custom package download source (e.g., using private mirror)
    // Can be specified via environment variable PYODIDE_PACKAGE_BASE_URL
    const customPackageBaseUrl = process.env.PYODIDE_PACKAGE_BASE_URL;
    const defaultPackageBaseUrl = customPackageBaseUrl
      ? `${customPackageBaseUrl.replace(/\/$/, "")}/` // Ensure trailing slash
      : `https://fastly.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;

    // Support custom package cache directory (Pyodide v0.28.1+)
    // Can be specified via environment variable PYODIDE_PACKAGE_CACHE_DIR
    // Default: system cache directory to avoid creating cache in every working directory
    const defaultPackageCacheDir = process.env.PYODIDE_PACKAGE_CACHE_DIR ||
      paths.cache;

    pyodideInstance = loadPyodide({
      packageBaseUrl: defaultPackageBaseUrl,
      packageCacheDir: defaultPackageCacheDir,
      ...config,
    });
  }
  return pyodideInstance;
};

export const getPip = async () => {
  const pyodide = await getPyodide();
  await pyodide.loadPackage("micropip", { messageCallback: () => {} });
  const micropip = pyodide.pyimport("micropip");
  return micropip;
};

export const loadDeps = async (
  code: string,
  importToPackageMap: Record<string, string> = {},
) => {
  const pyodide = await getPyodide();

  // Merge user-provided mapping with default mapping
  const defaultMappings: Record<string, string> = {
    sklearn: "scikit-learn",
    cv2: "opencv-python",
    PIL: "Pillow",
    bs4: "beautifulsoup4",
  };

  const combinedMap: Record<string, string> = {
    ...defaultMappings,
    ...importToPackageMap,
  };

  try {
    // Optimized approach for code analysis with better performance
    const analysisCode = `
import pyodide, sys
try:
    # Find all imports in the code
    imports_found = pyodide.code.find_imports(${JSON.stringify(code)})
    
    # Get currently available modules (faster than checking all possible sources)
    available_modules = set(sys.modules.keys())
    
    # Add known built-in modules
    available_modules.update(sys.builtin_module_names)
    
    # Extract root packages and check availability
    missing_imports = []
    checked_packages = set()
    
    for imp in imports_found:
        root_package = imp.split('.')[0]
        
        # Skip if we've already checked this package
        if root_package in checked_packages:
            continue
        checked_packages.add(root_package)
        
        # Quick check: if root package is in available modules, skip
        if root_package in available_modules:
            continue
            
        # Try importing to confirm it's missing
        try:
            exec(f"import {root_package}")
            # If successful, add to available modules for future checks
            available_modules.add(root_package)
        except ImportError:
            missing_imports.append(root_package)
        except Exception:
            # If any other error (like syntax issues), treat as missing
            missing_imports.append(root_package)
    
    # Return sorted unique missing imports
    result = sorted(list(set(missing_imports)))
    
except Exception as e:
    print(f"Warning: Could not analyze imports: {e}")
    result = []

result`;

    const imports = pyodide.runPython(analysisCode).toJs();

    const pip = await getPip();

    // Collect packages to install:
    // 1. Auto-detected imports mapped to package names
    // 2. Explicitly declared packages from importToPackageMap values
    const packagesToInstall: string[] = [];

    // Add auto-detected imports
    if (imports && imports.length > 0) {
      for (const imp of imports) {
        packagesToInstall.push(imp in combinedMap ? combinedMap[imp] : imp);
      }
    }

    // Add explicitly declared packages (values from importToPackageMap)
    for (const pkg of Object.values(importToPackageMap)) {
      if (!packagesToInstall.includes(pkg)) {
        packagesToInstall.push(pkg);
      }
    }

    if (packagesToInstall.length > 0) {
      // Try batch installation first for better performance
      try {
        await pip.install(packagesToInstall);
        console.error(
          `[py] Successfully installed all packages: ${
            packagesToInstall.join(
              ", ",
            )
          }`,
        );
      } catch (_batchError) {
        console.error(
          "[py] Batch installation failed, trying individual installation",
        );

        // Fall back to individual installation
        for (const pkg of packagesToInstall) {
          try {
            await pip.install(pkg);
            console.error(`[py] Successfully installed: ${pkg}`);
          } catch (error) {
            console.error(`[py] Failed to install ${pkg}:`, error);
            // Continue with other packages
          }
        }
      }
    } else {
      console.error("[py] No missing imports detected");
    }
  } catch (error) {
    // If dependency loading fails, log but don't fail completely
    console.error("[py] Failed to load dependencies:", error);
    // Continue execution without external dependencies
  }
};

/**
 * Create a ReadableStream wired up with abort-handling.
 *
 * `onAbort` may be supplied to perform additional cleanup
 * (e.g. kill a child process, set Pyodide interrupt buffer, …).
 */
export function makeStream(
  abortSignal: AbortSignal | undefined,
  onStart: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
  onAbort?: () => void,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onStart(controller);

      if (abortSignal) {
        // If already aborted – trigger immediately
        if (abortSignal.aborted) {
          controller.error(
            abortSignal.reason ?? new Error("Operation aborted"),
          );
          onAbort?.();
          return;
        }

        // Otherwise listen for future aborts
        abortSignal.addEventListener(
          "abort",
          () => {
            controller.error(
              abortSignal.reason ?? new Error("Operation aborted"),
            );
            onAbort?.();
          },
          { once: true },
        );
      }
    },
  });
}
