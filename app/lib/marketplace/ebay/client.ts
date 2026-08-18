type CachedToken = {
  token: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

export function getEbayConfig() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
  const envSetting = process.env.EBAY_ENV?.toLowerCase();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing required server environment variables: EBAY_CLIENT_ID and/or EBAY_CLIENT_SECRET"
    );
  }

  const isSandboxKey =
    clientId.includes("-SBX-") || clientSecret.startsWith("SBX-");
  const isSandbox =
    envSetting === "sandbox" || (isSandboxKey && envSetting !== "production");

  const apiBase = isSandbox
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";

  return {
    clientId,
    clientSecret,
    marketplaceId,
    env: isSandbox ? "sandbox" : "production",
    apiBase,
  };
}

export async function getEbayAccessToken(): Promise<string> {
  const { clientId, clientSecret, apiBase } = getEbayConfig();

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const authHeader =
    "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const oauthRes = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: authHeader,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }).toString(),
    cache: "no-store",
  });

  if (!oauthRes.ok) {
    const errText = await oauthRes.text();
    let errJson: unknown;
    try {
      errJson = JSON.parse(errText);
    } catch {
      errJson = errText;
    }
    throw new Error(
      `eBay OAuth failed (HTTP ${oauthRes.status}): ${JSON.stringify(errJson)}`
    );
  }

  const data = await oauthRes.json();
  if (!data.access_token) {
    throw new Error("eBay OAuth response missing access_token");
  }

  const expiresInMs = (data.expires_in || 7200) * 1000;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };

  return cachedToken.token;
}

export async function ebayFetch<T = unknown>(
  endpointPath: string,
  searchParams?: Record<string, string>
): Promise<T> {
  const { apiBase, marketplaceId } = getEbayConfig();
  const token = await getEbayAccessToken();

  const url = new URL(endpointPath, apiBase);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    let errJson: unknown;
    try {
      errJson = JSON.parse(errText);
    } catch {
      errJson = errText;
    }
    throw new Error(
      `eBay API request failed (HTTP ${res.status}): ${JSON.stringify(errJson)}`
    );
  }

  return (await res.json()) as T;
}
