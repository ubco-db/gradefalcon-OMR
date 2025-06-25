import useApiClient from "./useApiClient";
import { useCallback } from "react";

const useLmsApi = () => {
  const { apiClient } = useApiClient();

  /**
   * Store LMS integration configuration for a class
   */
  const storeClassLmsIntegration = useCallback(async (classId, lmsType, accessToken, lmsCourseId) => {
    try {
      const requestBody = JSON.stringify({
        lmsType,
        accessToken,
        lmsCourseId
      });
      
      const response = await apiClient(`/api/lms/class/${classId}/integration`, {
        method: 'POST',
        body: requestBody
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to store LMS integration." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong storing LMS integration. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Get LMS integration configuration for a class
   */
  const getClassLmsIntegration = useCallback(async (classId) => {
    try {
      const response = await apiClient(`/api/lms/class/${classId}/integration`, {
        method: 'GET'
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: "No LMS integration found", notFound: true };
        }
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to get LMS integration." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong getting LMS integration. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Remove LMS integration for a class
   */
  const removeClassLmsIntegration = useCallback(async (classId) => {
    try {
      const response = await apiClient(`/api/lms/class/${classId}/integration`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to remove LMS integration." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong removing LMS integration. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Validate LMS integration credentials for a class
   */
  const validateClassLmsIntegration = useCallback(async (classId) => {
    try {
      const response = await apiClient(`/api/lms/class/${classId}/validate`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to validate LMS integration." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong validating LMS integration. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Get available courses from LMS
   */
  const getLmsCourses = useCallback(async (classId) => {
    try {
      const response = await apiClient(`/api/lms/class/${classId}/courses`, {
        method: 'GET'
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to fetch LMS courses." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong fetching LMS courses. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Get available assignments from LMS course
   */
  const getLmsAssignments = useCallback(async (classId) => {
    try {
      const response = await apiClient(`/api/lms/class/${classId}/assignments`, {
        method: 'GET'
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to fetch LMS assignments." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong fetching LMS assignments. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Link exam to LMS assignment
   */
  const storeExamLmsAssignment = useCallback(async (examId, lmsAssignmentId) => {
    try {
      const requestBody = JSON.stringify({
        lmsAssignmentId
      });
      
      const response = await apiClient(`/api/lms/exam/${examId}/assignment`, {
        method: 'POST',
        body: requestBody
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to link exam to assignment." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong linking exam to assignment. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Get LMS assignment for exam
   */
  const getExamLmsAssignment = useCallback(async (examId) => {
    try {
      const response = await apiClient(`/api/lms/exam/${examId}/assignment`, {
        method: 'GET'
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: "No LMS assignment found", notFound: true };
        }
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to get exam assignment." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong getting exam assignment. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Export exam grades to LMS
   */
  const exportGradesToLms = useCallback(async (examId) => {
    try {
      const response = await apiClient(`/api/lms/exam/${examId}/export-grades`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to export grades." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong exporting grades. Please try again later." };
    }
  }, [apiClient]);

  /**
   * Export exam submissions to LMS
   */
  const exportSubmissionsToLms = useCallback(async (examId) => {
    try {
      const response = await apiClient(`/api/lms/exam/${examId}/export-submissions`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.error || "Failed to export submissions." };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: "Something went wrong exporting submissions. Please try again later." };
    }
  }, [apiClient]);

  return {
    storeClassLmsIntegration,
    getClassLmsIntegration,
    removeClassLmsIntegration,
    validateClassLmsIntegration,
    getLmsCourses,
    getLmsAssignments,
    storeExamLmsAssignment,
    getExamLmsAssignment,
    exportGradesToLms,
    exportSubmissionsToLms
  };
};

export default useLmsApi;