import useApiClient from "./useApiClient";
import { useCallback } from "react";

// TODO don't use filepath in the future
const useExamApi = () => {
  const { apiClient } = useApiClient();

  // TODO Longsai will refactor once the flask API is ready
  /**
   * Fetches the exam image for the given exam ID
   * total of 4 images are fetched: front, back, original front, original back
   * return a map of image key to the image URL
   * @type {(function(*, *): Promise<void>)|*}
   */
  const fetchStudentExamImages = useCallback(async (examId, studentId) => {
    try {
      const path = `../../uploads/Students/exam_id_${examId}/student_id_${studentId}/`;
      // Define the requests for each image
      const requests = [
        { side: "front", file_name: `${path}front_page.png` },
        { side: "back", file_name: `${path}back_page.png` },
        { side: "originalFront", file_name: `${path}original_front_page.png` },
        { side: "originalBack", file_name: `${path}original_back_page.png` },
      ];

      const fetchPromises = requests.map(async ({ side, file_name }) => {
        return apiClient(`/api/exam/fetchImage`, {
          method: "POST",
          body: JSON.stringify({ side: side, file_name: file_name })
        }).then(response => {
          if (!response.ok) throw new Error("Failed to fetch student exam image ", side);
          return response.blob();
        }).then(blob => {
          return { [side]: URL.createObjectURL(blob) };// convert blob to object URL
        });
      })
      const results = await Promise.all(fetchPromises);
      return Object.assign({}, ...results); // merge the results into a single object

    } catch (err) {
      console.error("Error fetching student exam images:", err);
    }
  }, [apiClient])

  /**
  * Exports and downloads scanned exam results as a ZIP file
  * @param {string} examId - The exam ID
  * @param {string} [filename] - Optional custom filename
  * @returns {Promise<{success: boolean, error?: string}>}
  */
  const exportScannedResults = useCallback(async (examId, filename = null) => {
    try {
      const response = await apiClient(`/api/exam/exportScannedResults/${examId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include"
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.message || "Failed to export scanned results." };
      }

      const blob = await response.blob();
      // extract filename from content-disposition header
      const contentDisposition = response.headers.get("Content-Disposition");

      let downloadName = filename || `exam_${examId}_scanned_results.zip`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match && match[1]) {
          downloadName = match[1];
        }
      }

      // trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return { success: true };
    } catch (err) {
      console.error("Error exporting scanned results:", err);
    }
  }, [apiClient]);

  /**
  * Fetches exam details including student results and question stats
  * @param {string} examId - The exam ID
  * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
  */
  const fetchExamDetails = useCallback(async (examId) => {
    try {
      const response = await apiClient(`/api/exam/getExamDetails/${examId}`, {
        method: "GET",
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData?.message || "Failed to fetch exam details." };
      }
      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      console.error("Error fetching exam details:", err);
      return { success: false, error: err.message || "Unexpected error occurred while fetching exam details." };
    }
  }, [apiClient]);

  return { fetchStudentExamImages, exportScannedResults, fetchExamDetails };
}
export default useExamApi;
