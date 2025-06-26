class MockLmsService {
  constructor() {
    this.mockData = {
      courses: [
        {
          id: "123456",
          name: "Introduction to Computer Science",
          course_code: "COSC 101",
          term: "Fall 2024"
        },
        {
          id: "789012",
          name: "Data Structures and Algorithms",
          course_code: "COSC 221",
          term: "Fall 2024"
        },
        {
          id: "345678",
          name: "Software Engineering",
          course_code: "COSC 310",
          term: "Fall 2024"
        }
      ],
      assignments: {
        "123456": [
          {
            id: "1001",
            name: "Midterm Exam",
            description: "Mid-semester examination covering chapters 1-5",
            points_possible: 100,
            course_id: "123456"
          },
          {
            id: "1002",
            name: "Final Exam",
            description: "Comprehensive final examination",
            points_possible: 150,
            course_id: "123456"
          }
        ],
        "789012": [
          {
            id: "2001",
            name: "Algorithm Analysis Quiz",
            description: "Quiz on Big O notation and complexity analysis",
            points_possible: 50,
            course_id: "789012"
          }
        ],
        "345678": [
          {
            id: "3001",
            name: "Design Patterns Exam",
            description: "Examination on software design patterns",
            points_possible: 80,
            course_id: "345678"
          }
        ]
      },
      students: {
        "123456": [
          { id: "s001", name: "Alice Johnson", sis_user_id: "alice.johnson", email: "alice.johnson@university.edu" },
          { id: "s002", name: "Bob Smith", sis_user_id: "bob.smith", email: "bob.smith@university.edu" },
          { id: "s003", name: "Carol Davis", sis_user_id: "carol.davis", email: "carol.davis@university.edu" }
        ]
      },
      submissions: {},
      grades: {}
    };
    
    this.delay = 500; // Simulate network delay
  }

  // Simulate network delay
  async _simulateNetworkDelay() {
    await new Promise(resolve => setTimeout(resolve, this.delay));
  }

  // Validate access token format
  _validateAccessToken(accessToken) {
    if (!accessToken || accessToken === '********************') {
      return { valid: false, error: 'Invalid access token format' };
    }
    
    // Simple validation - token should be at least 20 characters
    if (accessToken.length < 20) {
      return { valid: false, error: 'Access token too short' };
    }
    
    return { valid: true };
  }

  // Validate course ID
  _validateCourseId(courseId) {
    const course = this.mockData.courses.find(c => c.id === courseId);
    if (!course) {
      return { valid: false, error: `Course with ID ${courseId} not found` };
    }
    return { valid: true, course };
  }

  // Validate LMS integration
  async validateIntegration(accessToken, courseId) {
    await this._simulateNetworkDelay();
    
    // Validate access token
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      return { valid: false, error: tokenValidation.error };
    }
    
    // Validate course ID
    const courseValidation = this._validateCourseId(courseId);
    if (!courseValidation.valid) {
      return { valid: false, error: courseValidation.error };
    }
    
    return { valid: true, message: 'Integration validated successfully' };
  }

  // Get courses available to the user
  async getCourses(accessToken) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    return this.mockData.courses;
  }

  // Get assignments for a specific course
  async getAssignments(accessToken, courseId) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    const courseValidation = this._validateCourseId(courseId);
    if (!courseValidation.valid) {
      throw new Error(courseValidation.error);
    }
    
    return this.mockData.assignments[courseId] || [];
  }

  // Create a new assignment
  async createAssignment(accessToken, courseId, assignmentData) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    const courseValidation = this._validateCourseId(courseId);
    if (!courseValidation.valid) {
      throw new Error(courseValidation.error);
    }
    
    // Generate new assignment ID
    const newId = Date.now().toString();
    const newAssignment = {
      id: newId,
      name: assignmentData.name,
      description: assignmentData.description || '',
      points_possible: assignmentData.points_possible || 100,
      course_id: courseId,
      created_at: new Date().toISOString()
    };
    
    // Add to mock data
    if (!this.mockData.assignments[courseId]) {
      this.mockData.assignments[courseId] = [];
    }
    this.mockData.assignments[courseId].push(newAssignment);
    
    return newAssignment;
  }

  // Get students enrolled in a course
  async getStudents(accessToken, courseId) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    const courseValidation = this._validateCourseId(courseId);
    if (!courseValidation.valid) {
      throw new Error(courseValidation.error);
    }
    
    return this.mockData.students[courseId] || [];
  }

  // Submit grades for an assignment
  async submitGrades(accessToken, courseId, assignmentId, grades) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    const courseValidation = this._validateCourseId(courseId);
    if (!courseValidation.valid) {
      throw new Error(courseValidation.error);
    }
    
    // Validate assignment exists
    const assignments = this.mockData.assignments[courseId] || [];
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) {
      throw new Error(`Assignment with ID ${assignmentId} not found`);
    }
    
    // Store grades in mock data
    if (!this.mockData.grades[courseId]) {
      this.mockData.grades[courseId] = {};
    }
    if (!this.mockData.grades[courseId][assignmentId]) {
      this.mockData.grades[courseId][assignmentId] = {};
    }
    
    const results = [];
    for (const grade of grades) {
      this.mockData.grades[courseId][assignmentId][grade.student_id] = {
        score: grade.score,
        comment: grade.comment || '',
        submitted_at: new Date().toISOString()
      };
      
      results.push({
        student_id: grade.student_id,
        score: grade.score,
        status: 'success'
      });
    }
    
    return {
      assignment_id: assignmentId,
      total_submissions: grades.length,
      successful_submissions: results.length,
      results
    };
  }

  // Submit file submissions for an assignment
  async submitFiles(accessToken, courseId, assignmentId, submissions) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    const courseValidation = this._validateCourseId(courseId);
    if (!courseValidation.valid) {
      throw new Error(courseValidation.error);
    }
    
    // Store submissions in mock data
    if (!this.mockData.submissions[courseId]) {
      this.mockData.submissions[courseId] = {};
    }
    if (!this.mockData.submissions[courseId][assignmentId]) {
      this.mockData.submissions[courseId][assignmentId] = {};
    }
    
    const results = [];
    for (const submission of submissions) {
      const submissionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      
      this.mockData.submissions[courseId][assignmentId][submission.student_id] = {
        id: submissionId,
        file_name: submission.file_name,
        file_url: submission.file_url || `https://mock-lms.com/files/${submissionId}`,
        submitted_at: new Date().toISOString(),
        workflow_state: 'submitted'
      };
      
      results.push({
        student_id: submission.student_id,
        submission_id: submissionId,
        status: 'success'
      });
    }
    
    return {
      assignment_id: assignmentId,
      total_submissions: submissions.length,
      successful_submissions: results.length,
      results
    };
  }

  // Get assignment grades
  async getGrades(accessToken, courseId, assignmentId) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    const courseValidation = this._validateCourseId(courseId);
    if (!courseValidation.valid) {
      throw new Error(courseValidation.error);
    }
    
    const grades = this.mockData.grades[courseId]?.[assignmentId] || {};
    return Object.entries(grades).map(([studentId, gradeData]) => ({
      student_id: studentId,
      score: gradeData.score,
      comment: gradeData.comment,
      submitted_at: gradeData.submitted_at
    }));
  }

  // Test connection
  async testConnection(accessToken) {
    await this._simulateNetworkDelay();
    
    const tokenValidation = this._validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      throw new Error(tokenValidation.error);
    }
    
    return {
      status: 'connected',
      user: {
        id: 'mock_user_123',
        name: 'Mock User',
        email: 'mock.user@university.edu'
      },
      timestamp: new Date().toISOString()
    };
  }

  // Set network delay for testing
  setNetworkDelay(delayMs) {
    this.delay = delayMs;
  }

  // Add mock data for testing
  addMockCourse(course) {
    this.mockData.courses.push(course);
  }

  addMockAssignment(courseId, assignment) {
    if (!this.mockData.assignments[courseId]) {
      this.mockData.assignments[courseId] = [];
    }
    this.mockData.assignments[courseId].push(assignment);
  }

  // Clear all mock data
  clearMockData() {
    this.mockData = {
      courses: [],
      assignments: {},
      students: {},
      submissions: {},
      grades: {}
    };
  }

  // Reset to default mock data
  resetToDefaults() {
    this.__constructor();
  }
}

export default MockLmsService;