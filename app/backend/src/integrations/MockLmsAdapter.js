// @ts-check
const LMSAdapter = require('./LMSAdapter');


const MOCK_ADAPTER_TOKEN_MIN_LENGTH = 10;
class MockLmsAdapter extends LMSAdapter {
  /**
   * @param {any} accessToken
   */
  constructor(accessToken, config = {}) {
    super(accessToken, config);
    this.baseUrl = 'https://mock-canvas.instructure.com';
    this.mockData = this._initializeMockData();
  }

  _initializeMockData() {
    return {
      courses: [
      {
        id: 123456,
        name: "Introduction to Computer Science",
        course_code: "COSC 101",
        workflow_state: "available",
        enrollment_term_id: 1,
        start_at: "2024-09-01T00:00:00Z",
        end_at: "2024-12-15T23:59:59Z"
      },
      {
        id: 789012,
        name: "Data Structures and Algorithms",
        course_code: "COSC 221",
        workflow_state: "available",
        enrollment_term_id: 1,
        start_at: "2024-09-01T00:00:00Z",
        end_at: "2024-12-15T23:59:59Z"
      }
      ],
      assignments: {
      123456: [
        {
        id: 1001,
        name: "Midterm Exam",
        description: "Mid-semester examination",
        due_at: "2024-10-15T23:59:00Z",
        points_possible: 100,
        course_id: 123456,
        workflow_state: "published"
        },
        {
        id: 1002,
        name: "Final Exam",
        description: "End of semester final exam",
        due_at: "2024-12-10T23:59:00Z",
        points_possible: 120,
        course_id: 123456,
        workflow_state: "published"
        },
        {
        id: 1003,
        name: "Quiz 1",
        description: "First quiz of the course",
        due_at: "2024-09-20T23:59:00Z",
        points_possible: 20,
        course_id: 123456,
        workflow_state: "published"
        }
      ],
      789012: [
        {
        id: 2001,
        name: "Midterm Exam",
        description: "Mid-semester examination",
        due_at: "2024-10-20T23:59:00Z",
        points_possible: 100,
        course_id: 789012,
        workflow_state: "published"
        },
        {
        id: 2002,
        name: "Final Exam",
        description: "End of semester final exam",
        due_at: "2024-12-12T23:59:00Z",
        points_possible: 120,
        course_id: 789012,
        workflow_state: "published"
        },
        {
        id: 2003,
        name: "Quiz 1",
        description: "First quiz of the course",
        due_at: "2024-09-25T23:59:00Z",
        points_possible: 25,
        course_id: 789012,
        workflow_state: "published"
        }
      ]
      },
      enrollments: {
      123456: [
        { user_id: 1, user: { name: "Alice Johnson", sortable_name: "Johnson, Alice" }},
        { user_id: 2, user: { name: "Bob Smith", sortable_name: "Smith, Bob" }}
      ],
      789012: [
        { user_id: 3, user: { name: "Charlie Brown", sortable_name: "Brown, Charlie" }},
        { user_id: 4, user: { name: "Dana Lee", sortable_name: "Lee, Dana" }}
      ]
      },
      grades: {},
      submissions: {}
    };
  }

  async _simulateDelay(ms = 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateCredentials() {
    await this._simulateDelay();
    
    if (!this.accessToken || this.accessToken.length < MOCK_ADAPTER_TOKEN_MIN_LENGTH) {
      return { valid: false, error: 'Invalid access token format' };
    }
    
    return { valid: true, message: 'Mock LMS credentials validated successfully' };
  }

  async getCourses() {
    await this._simulateDelay();
    return this.mockData.courses.map(course => ({
      id: course.id,
      name: course.name,
      code: course.course_code,
      term: course.enrollment_term_id ? `Term ${course.enrollment_term_id}` : undefined
    }));
  }

  /**
   * @param {string | number} courseId
   */
  async getAssignments(courseId) {
    await this._simulateDelay();
    const assignments = this.mockData.assignments[courseId] || [];
    return assignments.map((/** @type {{ id: any; name: any; description: any; points_possible: any; course_id: any; }} */ assignment) => ({
      id: assignment.id,
      name: assignment.name,
      description: assignment.description,
      pointsPossible: assignment.points_possible,
      courseId: assignment.course_id
    }));
  }

  /**
   * @param {string} courseId
   * @param {{ name: any; description: any; due_at: any; points_possible: any; submission_types: any; }} assignmentData
   */
  async createAssignment(courseId, assignmentData) {
    await this._simulateDelay();
    
    const newAssignment = {
      id: Date.now(),
      name: assignmentData.name,
      description: assignmentData.description || '',
      due_at: assignmentData.due_at,
      points_possible: assignmentData.points_possible,
      course_id: parseInt(courseId),
      workflow_state: 'published',
      submission_types: assignmentData.submission_types || ['online_upload'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!this.mockData.assignments[courseId]) {
      this.mockData.assignments[courseId] = [];
    }
    
    this.mockData.assignments[courseId].push(newAssignment);
    
    return {
      id: newAssignment.id,
      name: newAssignment.name,
      description: newAssignment.description,
      pointsPossible: newAssignment.points_possible,
      courseId: newAssignment.course_id,
      htmlUrl: `${this.baseUrl}/courses/${courseId}/assignments/${newAssignment.id}`
    };
  }
  
    /**
   * @param {string | number} courseId
   * @param {string | number} assignmentId
   * @param {string | any[]} studentScores
   */
    async uploadGrades(courseId, assignmentId, studentScores) {
    await this._simulateDelay();
    
    
    if (!this.mockData.grades[courseId]) {
      this.mockData.grades[courseId] = {};
    }
    if (!this.mockData.grades[courseId][assignmentId]) {
      this.mockData.grades[courseId][assignmentId] = {};
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const grade of studentScores) {
      try {
        this.mockData.grades[courseId][assignmentId][grade.student_id] = {
          score: grade.score,
          comment: grade.comment || '',
          submitted_at: new Date().toISOString()
        };
        
        results.push({
          student_id: grade.student_id,
          success: true,
          score: grade.score
        });
        successCount++;
      } catch (error) {
        results.push({
          student_id: grade.student_id,
          success: false,
          error: error.message
        });
        failureCount++;
      }
    }

    return {
      successCount,
      failureCount,
      total: studentScores.length,
      results
    };
  }

  async uploadSubmission(courseId, assignmentId, submissionData) {
    await this._simulateDelay();
    
    if (!this.mockData.submissions[courseId]) {
      this.mockData.submissions[courseId] = {};
    }
    if (!this.mockData.submissions[courseId][assignmentId]) {
      this.mockData.submissions[courseId][assignmentId] = {};
    }

    const submissionId = `mock_submission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.mockData.submissions[courseId][assignmentId][submissionData.lms_user_id] = {
      id: submissionId,
      workflow_state: 'submitted',
      submitted_at: new Date().toISOString(),
      ...submissionData
    };

    return {
      success: true,
      student_id: submissionData.student_id,
      submission_id: submissionId,
      message: 'Submission uploaded successfully'
    };
  }

}

module.exports = MockLmsAdapter;