import useApiClient from "./useApiClient";
import { useCallback, useState } from "react";

const useUserSyncApi = () => {
  const { apiClient } = useApiClient();
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  /**
   * Sync current user to database
   * Returns: { success: boolean, data?: object, error?: string }
   */
  const syncCurrentUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient('/api/usersync/sync', {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        const result = {
          success: false,
          error: errorData?.message || errorData?.error || "Failed to sync user."
        };
        setLastSyncResult(result);
        return result;
      }

      const result = await response.json();
      const successResult = {
        success: true,
        data: {
          synced: result.data?.synced,
          action: result.data?.action, // 'created', 'updated', 'exists'
          role: result.data?.role,     // 'admin', 'instructor', 'student'
          user: result.data?.user
        }
      };
      setLastSyncResult(successResult);
      return successResult;
    } catch (err) {
      const errorResult = {
        success: false,
        error: err.message || "Something went wrong syncing user. Please try again later."
      };
      setLastSyncResult(errorResult);
      return errorResult;
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  /**
   * Clear the last sync result
   */
  const clearSyncResult = useCallback(() => {
    setLastSyncResult(null);
  }, []);

  return {
    syncCurrentUser,
    clearSyncResult,
    isLoading,
    lastSyncResult
  };
};

export default useUserSyncApi;
