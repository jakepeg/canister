import {
  createActor,
  type backendInterface,
  type CreateActorOptions,
  ExternalBlob,
} from "./backend";
import { HttpAgent } from "@icp-sdk/core/agent";

const DEFAULT_PROJECT_ID = "0000000-0000-0000-0000-00000000000";

interface JsonConfig {
  backend_host: string;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin: string;
}

interface Config {
  backend_host?: string;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin?: string;
}

let configCache: Config | null = null;

function buildConfig(params: {
  backend_host: string | undefined;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin?: string;
}): Config {
  return { ...params };
}

export async function loadConfig(): Promise<Config> {
  if (configCache) {
    return configCache;
  }
  const backendCanisterId =
    process.env.CANISTER_ID_BACKEND ??
    process.env.CANISTER_ID_CANISTER_BACKEND;
  const isLocalNetwork = process.env.DFX_NETWORK === "local";
  const localBackendHost = isLocalNetwork ? "http://127.0.0.1:4943" : undefined;
  const envBaseUrl = process.env.BASE_URL || "/";
  const baseUrl = envBaseUrl.endsWith("/") ? envBaseUrl : `${envBaseUrl}/`;
  try {
    const response = await fetch(`${baseUrl}env.json`);
    const config = (await response.json()) as JsonConfig;
    if (!backendCanisterId && config.backend_canister_id === "undefined") {
      console.error("CANISTER_ID_BACKEND is not set");
      throw new Error("CANISTER_ID_BACKEND is not set");
    }

    const fullConfig = buildConfig({
      backend_host:
        config.backend_host === "undefined"
          ? localBackendHost
          : config.backend_host,
      backend_canister_id: (config.backend_canister_id === "undefined"
        ? backendCanisterId
        : config.backend_canister_id) as string,
      project_id:
        config.project_id !== "undefined"
          ? config.project_id
          : DEFAULT_PROJECT_ID,
      ii_derivation_origin:
        config.ii_derivation_origin === "undefined"
          ? undefined
          : config.ii_derivation_origin,
    });
    configCache = fullConfig;
    return fullConfig;
  } catch {
    if (!backendCanisterId) {
      console.error("CANISTER_ID_BACKEND is not set");
      throw new Error("CANISTER_ID_BACKEND is not set");
    }
    const fallbackConfig = buildConfig({
      backend_host: localBackendHost,
      backend_canister_id: backendCanisterId,
      project_id: DEFAULT_PROJECT_ID,
      ii_derivation_origin: undefined,
    });
    configCache = fallbackConfig;
    return fallbackConfig;
  }
}

function extractAgentErrorMessage(error: string): string {
  const errorString = String(error);
  const match = errorString.match(/with message:\s*'([^']+)'/s);
  return match ? match[1] : errorString;
}

function processError(e: unknown): never {
  if (e && typeof e === "object" && "message" in e) {
    throw new Error(extractAgentErrorMessage(`${e.message}`));
  }
  throw e;
}

async function maybeLoadMockBackend(): Promise<backendInterface | null> {
  if (import.meta.env.VITE_USE_MOCK !== "true") {
    return null;
  }

  try {
    // If VITE_USE_MOCK is enabled, try to load a mock backend module *if it exists*.
    // We use import.meta.glob so builds don't fail when the mock file is absent.
    const mockModules = import.meta.glob("./mocks/backend.{ts,tsx,js,jsx}");

    const path = Object.keys(mockModules)[0];
    if (!path) return null;

    const mod = (await mockModules[path]()) as {
      mockBackend?: backendInterface;
    };

    return mod.mockBackend ?? null;
  } catch {
    return null;
  }
}

export async function createActorWithConfig(
  options?: CreateActorOptions,
): Promise<backendInterface> {
  // Attempt to load mock backend if enabled
  const mock = await maybeLoadMockBackend();
  if (mock) {
    return mock;
  }

  const config = await loadConfig();
  const resolvedOptions = options ?? {};
  const { agentOptions: callerAgentOptions, ...restOptions } = resolvedOptions;
  const agent = new HttpAgent({
    ...callerAgentOptions,
    host: config.backend_host,
  });
  const isLocalHost =
    config.backend_host?.includes("localhost") ||
    config.backend_host?.includes("127.0.0.1");
  if (isLocalHost) {
    await agent.fetchRootKey().catch((err) => {
      console.warn(
        "Unable to fetch root key. Check to ensure that your local replica is running",
      );
      console.error(err);
    });
  }
  // Do not pass agentOptions into createActor when agent is set — generated
  // createActor warns and ignores agentOptions in that case.
  const actorOptions = {
    ...restOptions,
    actorOptions: {
      ...(resolvedOptions.actorOptions ?? {}),
      ...(isLocalHost ? { verifyQuerySignatures: false } : {}),
    },
    agent,
    processError,
  };

  const uploadFile = async (file: ExternalBlob): Promise<Uint8Array> => {
    return await file.getBytes();
  };

  const downloadFile = async (bytes: Uint8Array): Promise<ExternalBlob> => {
    return ExternalBlob.fromBytes(bytes);
  };

  return createActor(
    config.backend_canister_id,
    uploadFile,
    downloadFile,
    actorOptions,
  );
}
