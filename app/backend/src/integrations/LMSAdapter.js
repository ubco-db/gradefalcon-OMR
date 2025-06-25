class LMSAdapter {
  constructor(accessToken, config = {}) {
    this.accessToken = accessToken;
    this.config = config;
    this.baseUrl = config.baseUrl;
  }

  async uploadGrades(courseId, assignmentId, gradeData) {
    throw new Error('uploadGrades method must be implemented by subclass');
  }

  async uploadSubmission(courseId, assignmentId, studentId, submissionData) {
    throw new Error('uploadSubmission method must be implemented by subclass');
  }

  async createAssignment(courseId, assignmentData) {
    throw new Error('createAssignment method must be implemented by subclass');
  }

  async getCourses() {
    throw new Error('getCourses method must be implemented by subclass');
  }

  async getAssignments(courseId) {
    throw new Error('getAssignments method must be implemented by subclass');
  }

  async validateCredentials() {
    throw new Error('validateCredentials method must be implemented by subclass');
  }

  formatGradeData(studentScores, totalMarks) {
    throw new Error('formatGradeData method must be implemented by subclass');
  }

  formatSubmissionData(pdfBuffer, filename, studentId) {
    throw new Error('formatSubmissionData method must be implemented by subclass');
  }
}

module.exports = LMSAdapter;