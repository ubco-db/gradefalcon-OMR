import { useAuth0 } from "@auth0/auth0-react";

const useApiClient = () => {
  const { getAccessTokenSilently } = useAuth0();

  const apiClient = async (url, options = {}) => {
    const token = await getAccessTokenSilently();

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    return fetch(url, { ...options, headers, credentials: "include" });
  };

  return { apiClient };

};

export default useApiClient;
