declare const AGENTLOCKS_PACKAGE_NAME: string | undefined;
declare const AGENTLOCKS_PACKAGE_VERSION: string | undefined;

export const PACKAGE_NAME =
  typeof AGENTLOCKS_PACKAGE_NAME === "string" ? AGENTLOCKS_PACKAGE_NAME : "agentlocks";

export const PACKAGE_VERSION =
  typeof AGENTLOCKS_PACKAGE_VERSION === "string" ? AGENTLOCKS_PACKAGE_VERSION : "0.9.2";
