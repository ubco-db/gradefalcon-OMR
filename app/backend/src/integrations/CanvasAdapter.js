// @ts-check
const LMSAdapter = require('./LMSAdapter');
const fetch = require('node-fetch');
const FormData = require('form-data');

class CanvasAdapter extends LMSAdapter {
  constructor(accessToken, config = {}) {
    const defaultConfig = {
      baseUrl: config.baseUrl || 'https://canvas.ubc.ca/api/v1'
    };
    super(accessToken, { ...defaultConfig, ...config });
  }

  async _makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Don't set Content-Type for FormData requests
    if (options.body && options.body.constructor.name === 'FormData') {
      delete headers['Content-Type'];
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Canvas API Error (${response.status}): ${errorText}`);
    }

    // Return headers for pagination
    return {
      data: await response.json(),
      headers: response.headers
    };
  }

  async _makePaginatedRequest(endpoint, options = {}) {
    let results = [];
    let url = `${this.baseUrl}${endpoint}`;

    while (url) {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Canvas API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      results = results.concat(data);

      const linkHeader = response.headers.get('link');
      url = '';
      if (linkHeader) {
        const nextLink = linkHeader?.split(',').find(s => s.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/<(.*?)>/);
          url = match ? match[1] : ''; // Extract the URL from the link header
        } 
      } 
    }
    return results;
  }

  async validateCredentials() {
    try {
      await this._makeRequest('/users/self');
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async getCourses() {
    try {
      const courses = await this._makePaginatedRequest('/courses?enrollment_type=teacher&per_page=100');
      return courses.map(course => ({
        id: course.id,
        name: course.name,
        code: course.course_code,
        term: course.term?.name
      }));
    } catch (error) {
      throw new Error(`Failed to fetch courses: ${error.message}`);
    }
  }

  async getAssignments(courseId) {
    try {
      const assignments = await this._makePaginatedRequest(`/courses/${courseId}/assignments?per_page=100`);
      return assignments.map(assignment => ({
        id: assignment.id,
        name: assignment.name,
        description: assignment.description,
        pointsPossible: assignment.points_possible,
        courseId: parseInt(courseId),
        htmlUrl: assignment.html_url
      }));
    } catch (error) {
      throw new Error(`Failed to fetch assignments: ${error.message}`);
    }
  }

  async createAssignment(courseId, assignmentData) {
    const payload = {
      assignment: {
        name: assignmentData.name,
        description: assignmentData.description || '',
        points_possible: assignmentData.points_possible,
        due_at: assignmentData.due_at,
        submission_types: assignmentData.submission_types || ['online_upload'],
        published: assignmentData.published !== false
      }
    };

    try {
      const { data: assignment } = await this._makeRequest(`/courses/${courseId}/assignments`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      return {
        id: assignment.id,
        name: assignment.name,
        description: assignment.description,
        pointsPossible: assignment.points_possible,
        courseId: parseInt(courseId),
        htmlUrl: assignment.html_url
      };
    } catch (error) {
      throw new Error(`Failed to create assignment: ${error.message}`);
    }
  }

  
  async uploadGrades(courseId, assignmentId, studentScores) {
    
    const results = [];
    const errors = [];

    for (const grade of studentScores) {
      try {
        const payload = {
          submission: {
            posted_grade: grade.grade
          }
        };

        const { data: response } = await this._makeRequest(
          `/courses/${courseId}/assignments/${assignmentId}/submissions/${grade.lms_user_id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload)
          }
        );

        results.push({
          student_id: grade.student_id || grade.lms_user_id,
          lmsUserId: grade.lms_user_id,
          studentName: grade.student_name,
          success: true,
          grade: grade.score,
          canvasResponse: response.grade
        });
      } catch (error) {
        errors.push({
          studentId: grade.student_id || grade.lms_user_id,
          lmsUserId: grade.lms_user_id,
          studentName: grade.student_name,
          success: false,
          error: error.message,
          grade: grade.score
        });
      }
    }

    const successCount = results.length;
    const failureCount = errors.length;
    const total = studentScores.length;

    return {
      successful: results,
      failed: errors,
      total,
      successCount,
      failureCount
    };
  }

  async uploadSubmission(courseId, assignmentId, lmsStudentId, submissionData) {
    try {
      // Step 1: Request upload permission to student's submission folder
      const formData = new FormData();
      formData.append('name', submissionData.filename);
      formData.append('file', submissionData.buffer, {
        filename: submissionData.filename,
        contentType: 'application/pdf'
      });

      const { data: uploadResponse } = await this._makeRequest(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${lmsStudentId}/files`,
        {
          method: 'POST',
          body: formData
        }
      );

      // Step 2: Upload file to Canvas storage using the provided upload URL
      const fileFormData = new FormData();
      if (uploadResponse.upload_params) {
        Object.entries(uploadResponse.upload_params).forEach(([key, value]) => {
          fileFormData.append(key, value);
        });
      }
      
      const fileParamName = uploadResponse.file_param || 'file';
      fileFormData.append(fileParamName, submissionData.buffer, {
        filename: submissionData.filename,
        contentType: 'application/pdf'
      });

      const fileUploadResponse = await fetch(uploadResponse.upload_url, {
        method: 'POST',
        body: fileFormData
      });

      if (!fileUploadResponse.ok) {
        const errorText = await fileUploadResponse.text();
        throw new Error(`Failed to upload file to Canvas: ${fileUploadResponse.status} ${errorText}`);
      }

      const fileData = await fileUploadResponse.json();
      const fileId = fileData.id;

      // Step 3: Create submission with the uploaded file
      const submissionPayload = {
        submission: {
          submission_type: 'online_upload',
          file_ids: [fileId],
          user_id: lmsStudentId
        }
      };

      const { data: submissionResponse } = await this._makeRequest(
        `/courses/${courseId}/assignments/${assignmentId}/submissions`,
        {
          method: 'POST',
          body: JSON.stringify(submissionPayload),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        submission_id: submissionResponse.id,
        student_id: lmsStudentId,
        file_id: fileId,
        canvas_url: submissionResponse.preview_url || submissionResponse.url,
        workflow_state: submissionResponse.workflow_state
      };
    } catch (error) {
      return {
        success: false,
        student_id: lmsStudentId,
        error: error.message
      };
    }
  }



  formatSubmissionData(pdfBuffer, filename, studentId) {
    return {
      buffer: pdfBuffer,
      filename: filename,
      student_id: studentId,
      content_type: 'application/pdf'
    };
  }

  async getStudents(courseId) {
    try {
      const users = await this._makePaginatedRequest(`/courses/${courseId}/users?enrollment_type[]=student&include[]=enrollments&per_page=100`);
      return users.map(user => ({
        lms_user_id: user.id,
        student_id: user.sis_user_id,
        name: user.name,
        email: user.email
      }));
    } catch (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
  }
}

module.exports = CanvasAdapter;