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
        throw new Error(errorData.message || "Failed to submit appeal.");
      }

      const result = await response.json();
      console.log("Appeal submitted successfully:", result);
      return result;
    } catch (err) {
      console.error("Error submitting appeal:", err);
    }
  }, [apiClient])

  const hasUnresolvedAppeals = useCallback(async (examId, studentId) => {
    try {
      const response = await apiClient(`/api/gradeappeal/unresolved/exams/${examId}/students/${studentId}`, {
        method: "GET",
      });

      return response.status !== 404;
    } catch (err) {
      console.error("Error fetching unresolved appeals:", err);
      return false;
    }
  }, [apiClient]);

  const fetchUnresolvedGradeAppeals = useCallback(async (examId, studentId) => {
    try {
      const response = await apiClient(`/api/gradeappeal/unresolved/exams/${examId}/students/${studentId}`, {
        method: "GET",
      });
      if (response.status === 200) {
        return response.json();
      }
    } catch (err) {
      console.error("Error fetching unresolved grade appeals:", err);
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


  return {submitAppeal, hasUnresolvedAppeals, fetchResolvedGradeAppeals, fetchExamUnresolvedGradeAppeals, respondGradeAppeal, fetchGradeAppealById};
};

export default useGradeAppealApi;
