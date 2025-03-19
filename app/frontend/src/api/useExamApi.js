import useApiClient from "./useApiClient";
import {useCallback} from "react";

// TODO don't use filepath in the future
const useExamApi = () => {
  const {apiClient} = useApiClient();

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

      const fetchPromises = requests.map(async ({side, file_name}) => {
        return apiClient(`/api/exam/fetchImage`, {
          method: "POST",
          body: JSON.stringify({side: side, file_name: file_name})
        }).then(response => {
          if (!response.ok) throw new Error("Failed to fetch student exam image ", side);
          return response.blob();
        }).then(blob => {
          return {[side]: URL.createObjectURL(blob)};// convert blob to object URL
        });
      })
      const results = await Promise.all(fetchPromises);
      return Object.assign({}, ...results); // merge the results into a single object

    } catch (err) {
      console.error("Error fetching student exam images:", err);
    }
  }, [apiClient]);
  return {fetchStudentExamImages};
}
export default useExamApi;
