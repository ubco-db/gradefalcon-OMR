import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useState, useCallback } from 'react';
import useUserSyncApi from './useUserSyncApi';

/**
 * Enhanced hook for automatic user synchronization with role management
 */
const useUserAutoSync = (options = {}) => {
  const { isAuthenticated, isLoading, user } = useAuth0();
  const { syncCurrentUser, isLoading: syncLoading, lastSyncResult } = useUserSyncApi();
  
  const [syncState, setSyncState] = useState({
    syncing: false,
    synced: false,
    error: null,
    userRole: null,
    syncData: null
  });

  const {
    enableAutoSync = true,
    onSyncSuccess = null,
    onSyncError = null
  } = options;

  /**
   * Perform user sync and handle results
   */
  const performSync = useCallback(async () => {
    if (!isAuthenticated || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    setSyncState(prev => ({ ...prev, syncing: true, error: null }));

    try {
      console.log('Syncing user:', user.email);
      const result = await syncCurrentUser();

      if (result.success) {
        console.log('User synced successfully:', result.data);
        const newState = {
          syncing: false,
          synced: true,
          error: null,
          userRole: result.data?.role || null,
          syncData: result.data
        };
        setSyncState(newState);

        if (onSyncSuccess) {
          onSyncSuccess(result.data);
        }

        return result;
      } else {
        console.error('User sync failed:', result.error);
        const errorState = {
          syncing: false,
          synced: false,
          error: result.error || 'Sync failed',
          userRole: null,
          syncData: null
        };
        setSyncState(errorState);

        if (onSyncError) {
          onSyncError(result.error);
        }

        return result;
      }
    } catch (error) {
      console.error('Auto-sync error:', error);
      const errorState = {
        syncing: false,
        synced: false,
        error: error.message || 'Sync failed',
        userRole: null,
        syncData: null
      };
      setSyncState(errorState);

      if (onSyncError) {
        onSyncError(error.message);
      }

      return { success: false, error: error.message };
    }
  }, [isAuthenticated, user, syncCurrentUser, onSyncSuccess, onSyncError]);

  /**
   * Manual sync function
   */
  const manualSync = useCallback(async () => {
    return await performSync();
  }, [performSync]);

  /**
   * Reset sync state
   */
  const resetSyncState = useCallback(() => {
    setSyncState({
      syncing: false,
      synced: false,
      error: null,
      userRole: null,
      syncData: null
    });
  }, []);

  // Auto sync on authentication
  useEffect(() => {
    if (enableAutoSync && isAuthenticated && !isLoading && user && !syncState.syncing && !syncState.synced) {
      performSync();
    }
  }, [enableAutoSync, isAuthenticated, isLoading, user, syncState.syncing, syncState.synced, performSync]);

  // Reset sync status when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      resetSyncState();
    }
  }, [isAuthenticated, resetSyncState]);

  return {
    // Sync functions
    manualSync,
    resetSyncState,
    
    // Loading states
    isLoading: isLoading || syncLoading || syncState.syncing,
    isSyncing: syncState.syncing,
    
    // Sync status
    synced: syncState.synced,
    error: syncState.error,
    syncData: syncState.syncData,
    lastSyncResult,
    
    // User role helpers
    userRole: syncState.userRole,
    hasRole: syncState.userRole !== null,
    isAdmin: syncState.userRole === 'admin',
    isInstructor: syncState.userRole === 'instructor',
    isStudent: syncState.userRole === 'student',
    
    // Auth0 data
    user,
    isAuthenticated,
    
    // Legacy compatibility
    syncStatus: syncState
  };
};

export default useUserAutoSync;
