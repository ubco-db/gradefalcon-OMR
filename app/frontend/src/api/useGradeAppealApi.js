import useApiClient from "./useApiClient";
import {useCallback} from "react";

const useGradeAppealApi = () => {
  const {apiClient} = useApiClient();

  const submitAppeal = useCallback(async (examId, studentId, appealDetails) => {
    try {
      const requestBody = JSON.stringify({exam_id: examId, student_id: studentId, appeal_details: appealDetails});
      const response = await apiClient(`api/gradeappeal/submit`, {
        method: 'POST',
        body: requestBody
      });
      if (!response.ok) {
        const errorData = await response.json();
        return {success: false, error: errorData?.message || "Failed to submit appeal."};
      }

      const result = await response.json();
      return {success: true, data: result};
    } catch (err) {
      return {success: false, error: "submitAppeal: Something went wrong. Please try again later."};
    }
  }, [apiClient])

  /**
   * Check if a student has any unresolved appeals for a given exam. true if there are unresolved appeals, false if there are none.
   * @type {(function(*, *): Promise<boolean|undefined>)|*}
   */
  const fetchUnresolvedAppeals = useCallback(async (examId, studentId) => {
    try {
      const response = await apiClient(`/api/gradeappeal/unresolved/exams/${examId}/students/${studentId}`, {
        method: "GET",
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {success: false, error: errorData?.message || "Failed to fetch unresolved appeals."};
      }
      const result = await response.json();
      return {success: true, data: result?.data};
    } catch (err) {
      return {success: false, error: "fetchUnresolvedAppeals: Something went wrong. Please try again later."};
    }
  }, [apiClient]);

  const fetchUnresolvedGradeAppeals = useCallback(async (examId, studentId) => {
    try {
      const response = await apiClient(`/api/gradeappeal/unresolved/exams/${examId}/students/${studentId}`, {
        method: "GET",
      });
      if (!response.ok) {
        const errorData = await response.json();
        return {success: false, error: errorData?.message || "Failed to fetch unresolved appeals."};
      }
      const result = await response.json();
      return {success: true, data: result?.data};
    } catch (err) {
      return {success: false, error: "fetchUnresolvedGradeAppeals: Something went wrong. Please try again later."};
    }
  }, [apiClient]);

  const fetchResolvedGradeAppeals = useCallback(async (examId, studentId) => {
    try {
      const response = await apiClient(`/api/gradeappeal/resolved/exams/${examId}/students/${studentId}`, {
        method: "GET",
      });
      if (response.status === 200) {
        return response.json();
      }
    } catch (err) {
      console.error("Error fetching resolved grade appeals:", err);
    }
  }, [apiClient]);

  const respondGradeAppeal = useCallback(async (gradeAppealId, replyDetails) => {
    try {
      const requestBody = JSON.stringify({grade_appeal_id: gradeAppealId, reply_details: replyDetails});
      const response = await apiClient(`/api/gradeappeal/respond`, {
        method: "POST",
        body: requestBody,
      })
      if (response.status === 200) {
        return response.json();
      }
    } catch (err) {
      console.error("Error response grade appeal: ", err);
    }
  }, [apiClient]);

  const fetchExamUnresolvedGradeAppeals = useCallback(async (examId) => {
    try {
      const response = await apiClient(`/api/gradeappeal/unresolved/exams/${examId}`, {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error(`Failed to respond to grade appeal: ${response.status} ${response.statusText}`);
      }
      return response.json();
    } catch (err) {
      console.error("Error fetching unresolved grade appeals:", err);
    }
  }, [apiClient]);

  const fetchGradeAppealById = useCallback(async (gradeAppealId) => {
    try {
      const response = await apiClient(`/api/gradeappeal/id/${gradeAppealId}`, {
        method: "GET",
      });
      if (response.status === 200) {
        return response.json();
      }
    } catch (err) {
      console.error("Error fetching grade appeal by id:", err);
    }
  }, [apiClient]);


  return {
    submitAppeal,
    fetchUnresolvedAppeals,
    fetchResolvedGradeAppeals,
    fetchExamUnresolvedGradeAppeals,
    respondGradeAppeal,
    fetchGradeAppealById
  };
};

export default useGradeAppealApi;
