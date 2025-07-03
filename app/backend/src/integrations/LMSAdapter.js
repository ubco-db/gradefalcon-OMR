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
   * Upload grades of `studentScores` to the LMS
   * @param {string|number} courseId - The course ID
   * @param {string|number} assignmentId - The assignment ID
   * @param {Array} studentScores - Array of student score objects with lms_user_id
   * @returns {Promise<Object>} Grade upload result
   * @returns {number} returns.total - Total number of grades processed
   * @returns {number} returns.successCount - Number of successful uploads
   * @returns {number} returns.failureCount - Number of failed uploads
   * @returns {Array} returns.successful - Array of successful upload results
   * @returns {Array} returns.failed - Array of failed upload results
   */
  async uploadGrades(courseId, assignmentId, studentScores) {
    throw new Error('uploadGrades method must be implemented by subclass');
  }

  /**
   * Upload submission of student `studentId` to the LMS
   * @param {string|number} courseId - The course ID on LMS
   * @param {string|number} assignmentId - The assignment ID on LMS
   * @param {Object} submissionData - Submission data object
   * @param {string|number} submissionData.student_id - Local student ID
   * @param {string|number} submissionData.lms_user_id - LMS user ID of the student
   * @param {string} submissionData.filename - Filename for the submission
   * @param {Buffer} submissionData.pdfBuffer - PDF buffer of the submission
   * @returns {Promise<Object>} Submission upload result
   * @returns {boolean} returns.success - Whether upload was successful
   * @returns {number} returns.studentId - Student ID
   * @returns {string} [returns.submissionId] - Submission ID if successful
   * @returns {string} [returns.error] - Error message if failed
   * @returns {string} [returns.message] - Success/failure message
   * @returns {string} [returns.url] - URL to submission if available
   */
  async uploadSubmission(courseId, assignmentId, submissionData) {
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
   * Get students from the LMS
   * @param {string|number} courseId - The course ID
   * @returns {Promise<Array<Object>>} Array of student objects
   * @returns {string} returns[].lms_user_id - The internal LMS user ID (e.g., Canvas user_id)
   * @returns {string} returns[].student_id - The student information system ID (maps to local student_id)
   * @returns {string} returns[].name - Student name
   * @returns {string} returns[].email - Student email
   */
  async getStudents(courseId) {
    throw new Error('getStudents method must be implemented by subclass');
  }
}

module.exports = LMSAdapter;