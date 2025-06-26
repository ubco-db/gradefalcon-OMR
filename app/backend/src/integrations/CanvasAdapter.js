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
      const nextLink = linkHeader?.split(',').find(s => s.includes('rel="next"'));
      url = nextLink ? nextLink.match(/<(.*?)>/)[1] : null;
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

  async uploadGrades(courseId, assignmentId, gradeData) {
    const results = [];
    const errors = [];

    for (const grade of gradeData) {
      try {
        const payload = {
          submission: {
            posted_grade: grade.score
          }
        };

        const { data: response } = await this._makeRequest(
          `/courses/${courseId}/assignments/${assignmentId}/submissions/${grade.student_id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload)
          }
        );

        results.push({
          student_id: grade.internal_student_id || grade.student_id,
          lms_user_id: grade.student_id, // This is actually the LMS user ID
          student_name: grade.student_name,
          success: true,
          grade: grade.score,
          canvas_response: response.grade
        });
      } catch (error) {
        errors.push({
          student_id: grade.internal_student_id || grade.student_id,
          lms_user_id: grade.student_id, // This is actually the LMS user ID
          student_name: grade.student_name,
          success: false,
          error: error.message,
          grade: grade.score
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      total: gradeData.length,
      successCount: results.length,
      failureCount: errors.length
    };
  }

  async uploadSubmission(courseId, assignmentId, studentId, submissionData) {
    try {
      const formData = new FormData();
      formData.append('submission[submission_type]', 'online_upload');
      formData.append('submission[file_ids][]', await this._uploadFile(courseId, submissionData));

      const { data: response } = await this._makeRequest(
        `/courses/${courseId}/assignments/${assignmentId}/submissions`,
        {
          method: 'POST',
          body: formData,
          headers: {}
        }
      );

      return {
        success: true,
        submission_id: response.id,
        student_id: studentId,
        canvas_url: response.preview_url
      };
    } catch (error) {
      return {
        success: false,
        student_id: studentId,
        error: error.message
      };
    }
  }

  async _uploadFile(courseId, submissionData) {
    const formData = new FormData();
    formData.append('name', submissionData.filename);
    formData.append('size', submissionData.buffer.length);
    formData.append('content_type', 'application/pdf');

    const { data: uploadResponse } = await this._makeRequest(`/courses/${courseId}/files`, {
      method: 'POST',
      body: formData,
      headers: {}
    });

    const fileFormData = new FormData();
    Object.entries(uploadResponse.upload_params).forEach(([key, value]) => {
      fileFormData.append(key, value);
    });
    fileFormData.append('file', submissionData.buffer, {
      filename: submissionData.filename,
      contentType: 'application/pdf'
    });

    const fileUploadResponse = await fetch(uploadResponse.upload_url, {
      method: 'POST',
      body: fileFormData
    });

    if (!fileUploadResponse.ok) {
      throw new Error('Failed to upload file to Canvas');
    }

    const fileData = await fileUploadResponse.json();
    return fileData.id;
  }

  formatGradeData(studentScores, totalMarks) {
    return studentScores
      .filter(student => student.lms_user_id) // Only include students with LMS mapping
      .map(student => ({
        student_id: student.lms_user_id, // Use LMS user ID for Canvas
        internal_student_id: student.student_id, // Keep internal ID for reference
        score: student.grade,
        percentage: totalMarks > 0 ? (student.grade / totalMarks) * 100 : 0,
        student_name: student.name
      }));
  }

  formatSubmissionData(pdfBuffer, filename, studentId) {
    return {
      buffer: pdfBuffer,
      filename: filename,
      student_id: studentId,
      content_type: 'application/pdf'
    };
  }

  async bulkUploadSubmissions(courseId, assignmentId, submissions) {
    const results = [];
    const errors = [];

    for (const submission of submissions) {
      try {
        const result = await this.uploadSubmission(
          courseId,
          assignmentId,
          submission.student_id,
          submission.data
        );

        if (result.success) {
          results.push(result);
        } else {
          errors.push(result);
        }
      } catch (error) {
        errors.push({
          success: false,
          student_id: submission.student_id,
          error: error.message
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      total: submissions.length,
      successCount: results.length,
      failureCount: errors.length
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