/**
 * Abstract base class for LMS adapters
 * All adapters must implement these methods with consistent return formats
 */
class LMSAdapter {
  constructor(accessToken, config = {}) {
    this.accessToken = accessToken;
    this.config = config;
    this.baseUrl = config.baseUrl;
  }

  /**
   * Upload grades to the LMS
   * @param {string|number} courseId - The course ID
   * @param {string|number} assignmentId - The assignment ID
   * @param {Array} gradeData - Array of grade objects
   * @returns {Promise<Object>} Grade upload result
   * @returns {number} returns.total - Total number of grades processed
   * @returns {number} returns.successCount - Number of successful uploads
   * @returns {number} returns.failureCount - Number of failed uploads
   * @returns {Array} returns.successful - Array of successful upload results
   * @returns {Array} returns.failed - Array of failed upload results
   * @returns {string} returns.message - Summary message
   */
  async uploadGrades(courseId, assignmentId, gradeData) {
    throw new Error('uploadGrades method must be implemented by subclass');
  }

  /**
   * Upload submission to the LMS
   * @param {string|number} courseId - The course ID
   * @param {string|number} assignmentId - The assignment ID
   * @param {string|number} studentId - The student ID
   * @param {Object} submissionData - Submission data object
   * @returns {Promise<Object>} Submission upload result
   * @returns {boolean} returns.success - Whether upload was successful
   * @returns {number} returns.studentId - Student ID
   * @returns {string} [returns.submissionId] - Submission ID if successful
   * @returns {string} [returns.error] - Error message if failed
   * @returns {string} [returns.message] - Success/failure message
   * @returns {string} [returns.url] - URL to submission if available
   */
  async uploadSubmission(courseId, assignmentId, studentId, submissionData) {
    throw new Error('uploadSubmission method must be implemented by subclass');
  }

  /**
   * Create assignment in the LMS
   * @param {string|number} courseId - The course ID
   * @param {Object} assignmentData - Assignment data
   * @param {string} assignmentData.name - Assignment name
   * @param {string} [assignmentData.description] - Assignment description
   * @param {number} assignmentData.points_possible - Maximum points
   * @returns {Promise<Object>} Created assignment
   * @returns {number} returns.id - Assignment ID
   * @returns {string} returns.name - Assignment name
   * @returns {string} [returns.description] - Assignment description
   * @returns {number} returns.pointsPossible - Maximum points
   * @returns {number} [returns.courseId] - Course ID
   * @returns {string} [returns.htmlUrl] - URL to assignment
   */
  async createAssignment(courseId, assignmentData) {
    throw new Error('createAssignment method must be implemented by subclass');
  }

  /**
   * Get courses from the LMS
   * @returns {Promise<Array<Object>>} Array of course objects
   * @returns {number} returns[].id - Course ID
   * @returns {string} returns[].name - Course name
   * @returns {string} returns[].code - Course code
   * @returns {string} [returns[].term] - Course term
   */
  async getCourses() {
    throw new Error('getCourses method must be implemented by subclass');
  }

  /**
   * Get assignments for a course
   * @param {string|number} courseId - The course ID
   * @returns {Promise<Array<Object>>} Array of assignment objects
   * @returns {number} returns[].id - Assignment ID
   * @returns {string} returns[].name - Assignment name
   * @returns {string} [returns[].description] - Assignment description
   * @returns {number} returns[].pointsPossible - Maximum points
   * @returns {number} [returns[].courseId] - Course ID
   * @returns {string} [returns[].htmlUrl] - URL to assignment
   */
  async getAssignments(courseId) {
    throw new Error('getAssignments method must be implemented by subclass');
  }

  /**
   * Validate LMS credentials
   * @returns {Promise<Object>} Validation result
   * @returns {boolean} returns.valid - Whether credentials are valid
   * @returns {string} [returns.error] - Error message if invalid
   * @returns {string} [returns.message] - Success message if valid
   */
  async validateCredentials() {
    throw new Error('validateCredentials method must be implemented by subclass');
  }

  /**
   * Format grade data for LMS upload
   * @param {Array} studentScores - Array of student score objects
   * @param {number} totalMarks - Total possible marks
   * @returns {Array<Object>} Formatted grade data
   * @returns {number} returns[].student_id - Student ID
   * @returns {number} returns[].score - Student score
   * @returns {string} [returns[].comment] - Grade comment
   */
  formatGradeData(studentScores, totalMarks) {
    throw new Error('formatGradeData method must be implemented by subclass');
  }

  /**
   * Format submission data for LMS upload
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {string} filename - File name
   * @param {number} studentId - Student ID
   * @returns {Object} Formatted submission data
   */
  formatSubmissionData(pdfBuffer, filename, studentId) {
    throw new Error('formatSubmissionData method must be implemented by subclass');
  }
}

module.exports = LMSAdapter;