import { appParams } from '../lib/app-params';
import { createEntitiesModule } from "./modules/entities.js";
import { createAuthModule } from "./modules/auth.js";
import { createFunctionsModule } from "./modules/functions.js"
import { createAppLogsModule } from "./modules/app-logs.js";
import { createUsersModule } from "./modules/users.js";

import { getAccessToken } from "./utils/auth-utils.js";
import axios from 'axios'; // Import axios directly
import meData from './me.json';

// Experimental Elasticsearch Configuration
export const ENABLE_ELASTICSEARCH = true;


const localStub = {
  auth: {
    me: async () => meData,
    isAuthenticated: async () => false,
    logout: () => {},
    redirectToLogin: () => {},
    updateMe: async () => {},
  },
  entities: new Proxy({}, {
    get: () => new Proxy({}, {
      get: () => async () => [],
    }),
  }),
  integrations: {
    Core: {
      InvokeLLM: async () => {  },
      UploadFile: async () => {  },
      SendEmail: async () => {},
      GenerateImage: async () => {},
      ExtractDataFromUploadedFile: async () => {},
    },
  },
  functions: {
    invoke: async () => {},
  },
  analytics: {
    track: () => {},
  },
  users: {
    inviteUser: async () => {},
  },
};


// Refactor createAxiosClient to a direct Axios implementation
export function createAxiosClient({ baseURL, headers, token, interceptResponses }) {
  const instance = axios.create({
    baseURL: baseURL,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (interceptResponses) {
    instance.interceptors.response.use(
      response => response,
      error => {
        return Promise.reject(error);
      }
    );
  }

  return instance;
}

export function isLocalMode() {
  try {
    const prefix = import.meta.env.APP_PREFIX;
    const s = localStorage.getItem(prefix + "_settings");
    return s ? JSON.parse(s).local_mode === true : false;
  } catch {
    return false;
  }
}


export function createClient(config) {
    var _a, _b;
    const { serverUrl = "http://localhost", appId, token, serviceToken, requiresAuth = false, appBaseUrl, options, functionsVersion, headers: optionalHeaders, } = config;
    // Normalize appBaseUrl to always be a string (empty if not provided or invalid)
    const normalizedAppBaseUrl = typeof appBaseUrl === "string" ? appBaseUrl : "";
    const socketConfig = {
        serverUrl,
        mountPath: "/ws-user-apps/socket.io/",
        transports: ["websocket"],
        appId,
        token,
    };
    let socket = null;
    const getSocket = () => {
        if (!socket) {
            socket = RoomsSocket({
                config: socketConfig,
            });
        }
        return socket;
    };
    const headers = {
        ...optionalHeaders,
        "X-App-Id": String(appId),
    };
    const functionHeaders = functionsVersion
        ? {
            ...headers,
            "prompthub-Functions-Version": functionsVersion,
        }
        : headers;
    const axiosClient = createAxiosClient({
        baseURL: `${serverUrl}/api`,
        headers,
        token,
        onError: options === null || options === void 0 ? void 0 : options.onError,
    });
    const functionsAxiosClient = createAxiosClient({
        baseURL: `${serverUrl}/api`,
        headers: functionHeaders,
        token,
        interceptResponses: false,
        onError: options === null || options === void 0 ? void 0 : options.onError,
    });
    const serviceRoleHeaders = {
        ...headers,
        ...(token ? { "on-behalf-of": `Bearer ${token}` } : {}),
    };
    const serviceRoleAxiosClient = createAxiosClient({
        baseURL: `${serverUrl}/api`,
        headers: serviceRoleHeaders,
        token: serviceToken,
        onError: options === null || options === void 0 ? void 0 : options.onError,
    });
    const serviceRoleFunctionsAxiosClient = createAxiosClient({
        baseURL: `${serverUrl}/api`,
        headers: functionHeaders,
        token: serviceToken,
        interceptResponses: false,
    });
    const userAuthModule = createAuthModule(axiosClient, functionsAxiosClient, appId, {
        appBaseUrl: normalizedAppBaseUrl,
        serverUrl,
    });
    const userModules = {
        entities: createEntitiesModule({
            axios: axiosClient,
            appId,
            getSocket,
        }),
        integrations: {
                        Core: {
                          InvokeLLM: async () => {  },
                          UploadFile: async () => {  },
                          SendEmail: async () => {},
                          GenerateImage: async () => {},
                          ExtractDataFromUploadedFile: async () => {},
                        },
                      },
        
        auth: userAuthModule,
        functions: createFunctionsModule(functionsAxiosClient, appId, {
            getAuthHeaders: () => {
                const headers = {};
                // Get current token from storage or initial config
                const currentToken = token || getAccessToken();
                if (currentToken) {
                    headers["Authorization"] = `Bearer ${currentToken}`;
                }
                return headers;
            },
            baseURL: (_a = functionsAxiosClient.defaults) === null || _a === void 0 ? void 0 : _a.baseURL,
        }),
        appLogs: createAppLogsModule(axiosClient, appId),
        users: createUsersModule(axiosClient, appId)
    };
    const serviceRoleModules = {
        entities: createEntitiesModule({
            axios: serviceRoleAxiosClient,
            appId,
            getSocket,
        }),
        integrations: localStub.integrations,
        functions: createFunctionsModule(serviceRoleFunctionsAxiosClient, appId, {
            getAuthHeaders: () => {
                const headers = {};
                // Use service token for authorization
                if (serviceToken) {
                    headers["Authorization"] = `Bearer ${serviceToken}`;
                }
                return headers;
            },
            baseURL: (_b = serviceRoleFunctionsAxiosClient.defaults) === null || _b === void 0 ? void 0 : _b.baseURL,
        }),
        appLogs: createAppLogsModule(serviceRoleAxiosClient, appId),
        cleanup: () => {
            if (socket) {
                socket.disconnect();
            }
        },
    };
    // Always try to get token from localStorage or URL parameters
    if (typeof window !== "undefined") {
        // Get token from URL or localStorage
        const accessToken = token || getAccessToken();
        if (accessToken) {
            userModules.auth.setToken(accessToken);
        }
    }
    // If authentication is required, verify token and redirect to login if needed
    if (requiresAuth && typeof window !== "undefined") {
        // We perform this check asynchronously to not block client creation
        setTimeout(async () => {
            try {
                const isAuthenticated = await userModules.auth.isAuthenticated();
                if (!isAuthenticated) {
                    userModules.auth.redirectToLogin(window.location.href);
                }
            }
            catch (error) {
                console.error("Authentication check failed:", error);
                userModules.auth.redirectToLogin(window.location.href);
            }
        }, 0);
    }
    // Assemble and return the client
    const client = {
        ...userModules,


        
        setToken(newToken) {
            userModules.auth.setToken(newToken);
            if (socket) {
                socket.updateConfig({
                    token: newToken,
                });
            }
            socketConfig.token = newToken;
        },
        /**
         * Gets the current client configuration.
         *
         * @internal
         */
        getConfig() {
            return {
                serverUrl,
                appId,
                requiresAuth,
            };
        },
        
        get asServiceRole() {
            
            return serviceRoleModules;
        },
    };
    return client;
}

// No-op stub used when local_mode is enabled — nothing hits external servers

// Custom API client implementation
export const customApiClient = {
  auth: {
    me: async () => meData,
    isAuthenticated: async () => false,
    logout: () => {},
    redirectToLogin: () => {},
    updateMe: async () => {},
  },
  entities: new Proxy({}, {
    get: () => new Proxy({}, {
      get: () => async () => [],
    }),
  }),
  integrations: {
    Core: {
      InvokeLLM: async () => { throw new Error("InvokeLLM not implemented"); },
      UploadFile: async ({ file }) => {
        // Simulate an API call to upload a file
        try {
          const response = await fetch(appParams.apiBaseUrl +  '/upload', {
            method: 'POST',
            body: file,
          });
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          const data = await response.json();
          return { file_url: data.file_url };
        } catch (error) {
          console.error('There has been a problem with your fetch operation:', error);
          throw error;
        }
      },
      SendEmail: async () => {},
      GenerateImage: async () => {},
      ExtractDataFromUploadedFile: async () => {},
    },
  },
  functions: {
    invoke: async () => {},
  },
  analytics: {
    track: () => {},
  },
  users: {
    inviteUser: async () => {},
  },
};


export function createClientFromRequest(request) {
    const authHeader = request.headers.get("Authorization");
    const serviceRoleAuthHeader = request.headers.get("prompthub-Service-Authorization");
    const appId = request.headers.get("prompthub-App-Id");
    const serverUrlHeader = request.headers.get("prompthub-Api-Url");
    const functionsVersion = request.headers.get("prompthub-Functions-Version");
    const stateHeader = request.headers.get("prompthub-State");
    if (!appId) {
        console.log("App-Id header is required, but is was not found on the request");
    }
    // Validate authorization header formats
    let serviceRoleToken;
    let userToken;
    if (serviceRoleAuthHeader !== null) {
        if (serviceRoleAuthHeader === "" ||
            !serviceRoleAuthHeader.startsWith("Bearer ") ||
            serviceRoleAuthHeader.split(" ").length !== 2) {
            //throw new Error
            console.log('Invalid authorization header format. Expected "Bearer <token>"');
        }
        serviceRoleToken = serviceRoleAuthHeader.split(" ")[1];
    }
    if (authHeader !== null) {
        if (authHeader === "" ||
            !authHeader.startsWith("Bearer ") ||
            authHeader.split(" ").length !== 2) {
            //throw new Error
            console.log('Invalid authorization header format. Expected "Bearer <token>"');
        }
        userToken = authHeader.split(" ")[1];
    }
    // Prepare additional headers to propagate
    const additionalHeaders = {};
    if (stateHeader) {
        additionalHeaders["prompthub-State"] = stateHeader;
    }
    return createClient({
        serverUrl: serverUrlHeader || "http://localhost:5174",
        appId,
        token: userToken,
        serviceToken: serviceRoleToken,
        functionsVersion: functionsVersion !== null && functionsVersion !== void 0 ? functionsVersion : undefined,
        headers: additionalHeaders,
    });
}


const _local = isLocalMode();

// Log the local mode status
console.log("Running in local mode:", _local);

// Dump localStorage as a table
function dumpObject(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    console.log("obj is empty.");
    return;
  }

  
  console.log(JSON.stringify(obj));
}

const appId ="prompthub-App-Id";
const functionsVersion = null;
export const defaultClient = createClient({
        serverUrl: "http://localhost:5174",
        appId,
        functionsVersion: functionsVersion !== null && functionsVersion !== void 0 ? functionsVersion : undefined,
        headers: {},
    });
export const client = _local ? localStub : defaultClient;

dumpObject(localStorage);

dumpObject(client);

dumpObject(defaultClient);
