import { useAuth0 } from "@auth0/auth0-react";
import { useCallback } from "react";

const useApiClient = () => {
  const { getAccessTokenSilently } = useAuth0();

  const apiClient = useCallback(async (url, options = {}) => {
    const token = await getAccessTokenSilently();

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    return fetch(url, { ...options, headers, credentials: "include" });
  }, [getAccessTokenSilently]);

  return { apiClient };

};

export default useApiClient;
