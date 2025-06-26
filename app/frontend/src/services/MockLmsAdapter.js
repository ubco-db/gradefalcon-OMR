class MockLmsAdapter {
  constructor() {
    this.baseUrl = 'https://mock-canvas.instructure.com';
    this.mockData = {
      courses: [
      {
        id: 123456,
        name: "Principles of Genetics",
        course_code: "BIOL 265",
        enrollment_term_id: 1
      },
      {
        id: 789012,
        name: "Introduction to Database",
        course_code: "COSC 304",
        enrollment_term_id: 1
      }
      ],
      assignments: {
      123456: [
        {
        id: 1001,
        name: "Midterm Exam",
        description: "Mid-semester examination",
        points_possible: 100,
        course_id: 123456
        }
      ],
      789012: [
        {
        id: 2001,
        name: "Test Exam",
        description: "COSC 304 Test Exam",
        points_possible: 75,
        course_id: 789012
        }
      ]
      },
      enrollments: {
      123456: [
        { user_id: 1, user: { name: "Alice Johnson", sortable_name: "Johnson, Alice" }},
        { user_id: 2, user: { name: "Bob Smith", sortable_name: "Smith, Bob" }}
      ]
      }
    };
  }

  async makeRequest(endpoint, options = {}) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const { method = 'GET', headers = {}, body } = options;
    
    // Simulate Canvas API response format
    return {
      ok: true,
      status: 200,
      json: async () => {
        if (endpoint.includes('/courses') && method === 'GET') {
          return this.mockData.courses;
        }
        
        if (endpoint.includes('/assignments') && method === 'GET') {
          const courseId = this.extractCourseId(endpoint);
          return this.mockData.assignments[courseId] || [];
        }
        
        if (endpoint.includes('/enrollments') && method === 'GET') {
          const courseId = this.extractCourseId(endpoint);
          return this.mockData.enrollments[courseId] || [];
        }
        
        if (endpoint.includes('/assignments') && method === 'POST') {
          const courseId = this.extractCourseId(endpoint);
          const assignmentData = JSON.parse(body);
          const newAssignment = {
            id: Date.now(),
            ...assignmentData.assignment,
            course_id: courseId
          };
          
          if (!this.mockData.assignments[courseId]) {
            this.mockData.assignments[courseId] = [];
          }
          this.mockData.assignments[courseId].push(newAssignment);
          
          return newAssignment;
        }
        
        return { success: true };
      }
    };
  }

  extractCourseId(endpoint) {
    const match = endpoint.match(/courses\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  // Canvas API methods
  async getCourses(accessToken) {
    const response = await this.makeRequest('/api/v1/courses', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch courses');
    }
    
    return await response.json();
  }

  async getCourse(courseId, accessToken) {
    const courses = await this.getCourses(accessToken);
    const course = courses.find(c => c.id === parseInt(courseId));
    
    if (!course) {
      throw new Error(`Course ${courseId} not found`);
    }
    
    return course;
  }

  async getAssignments(courseId, accessToken) {
    const response = await this.makeRequest(`/api/v1/courses/${courseId}/assignments`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch assignments');
    }
    
    return await response.json();
  }

  async createAssignment(courseId, assignmentData, accessToken) {
    const response = await this.makeRequest(`/api/v1/courses/${courseId}/assignments`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ assignment: assignmentData })
    });
    
    if (!response.ok) {
      throw new Error('Failed to create assignment');
    }
    
    return await response.json();
  }

  async getEnrollments(courseId, accessToken) {
    const response = await this.makeRequest(`/api/v1/courses/${courseId}/enrollments`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch enrollments');
    }
    
    return await response.json();
  }

  async submitGrade(courseId, assignmentId, userId, grade, accessToken) {
    const response = await this.makeRequest(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`, 
      {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          submission: {
            posted_grade: grade.score
          }
        })
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to submit grade');
    }
    
    return await response.json();
  }

  async validateConnection(accessToken) {
    try {
      await this.getCourses(accessToken);
      return { valid: true, message: 'Connection successful' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async validateCourse(courseId, accessToken) {
    try {
      await this.getCourse(courseId, accessToken);
      return { valid: true, message: 'Course found' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

export default MockLmsAdapter;