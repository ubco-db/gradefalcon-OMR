const CanvasAdapter = require('./CanvasAdapter');
const pool = require('../utils/db');
const { encrypt, decrypt } = require('../utils/crypto');

class LMSIntegrationService {
  constructor() {
    this.adapters = new Map();
    this.registerAdapter('canvas', CanvasAdapter);
  }

  registerAdapter(lmsType, AdapterClass) {
    this.adapters.set(lmsType, AdapterClass);
  }

  createAdapter(lmsType, accessToken, config = {}) {
    const AdapterClass = this.adapters.get(lmsType);
    if (!AdapterClass) {
      throw new Error(`Unsupported LMS type: ${lmsType}`);
    }
    return new AdapterClass(accessToken, config);
  }

  /**
   * Store LMS integration configuration for a class
   * @param {number} classId - The class ID
   * @param {string} lmsType - The LMS type (e.g., 'canvas')
   * @param {string} accessToken - The LMS access token
   * @param {string} lmsCourseId - The LMS course ID
   * @returns {Promise<number>} The integration ID
   */
  async storeClassLmsIntegration(classId, lmsType, accessToken, lmsCourseId) {
    try {
      // If accessToken is null, don't update the existing token (for asterisks placeholder case)
      if (accessToken === null) {
        const query = `
          INSERT INTO lms_integrations (class_id, lms_type, lms_course_id, encrypted_access_token)
          VALUES ($1, $2, $3, (SELECT encrypted_access_token FROM lms_integrations WHERE class_id = $1))
          ON CONFLICT (class_id)
          DO UPDATE SET
            lms_type = EXCLUDED.lms_type,
            lms_course_id = EXCLUDED.lms_course_id
          RETURNING integration_id
        `;

        const result = await pool.query(query, [classId, lmsType, lmsCourseId]);
        return result.rows[0].integration_id;
      }

      // Normal case: encrypt and store the new token
      const encryptedToken = await encrypt(accessToken);

      const query = `
        INSERT INTO lms_integrations (class_id, lms_type, lms_course_id, encrypted_access_token)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (class_id)
        DO UPDATE SET
          lms_type = EXCLUDED.lms_type,
          lms_course_id = EXCLUDED.lms_course_id,
          encrypted_access_token = EXCLUDED.encrypted_access_token
        RETURNING integration_id
      `;

      const result = await pool.query(query, [classId, lmsType, lmsCourseId, encryptedToken]);
      return result.rows[0].integration_id;
    } catch (error) {
      throw new Error(`Failed to store class integration: ${error.message}`);
    }
  }

  /**
   * Retrieve LMS integration configuration for a class
   * @param {number} classId - The class ID
   * @returns {Promise<Object|null>} The integration data or null if not found
   */
  async getClassLmsIntegration(classId) {
    try {
      const query = `
        SELECT lms_type, lms_course_id, encrypted_access_token
        FROM lms_integrations
        WHERE class_id = $1
      `;

      const result = await pool.query(query, [classId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const { lms_type, lms_course_id, encrypted_access_token } = result.rows[0];
      const accessToken = await decrypt(encrypted_access_token);

      return { 
        lmsType: lms_type, 
        lmsCourseId: lms_course_id, 
        accessToken 
      };
    } catch (error) {
      throw new Error(`Failed to retrieve class integration: ${error.message}`);
    }
  }

  /**
   * Validate LMS integration credentials for a class
   * @param {number} classId - The class ID
   * @returns {Promise<Object>} Validation result with valid boolean and error message
   */
  async validateClassLmsIntegration(classId) {
    try {
      const integration = await this.getClassLmsIntegration(classId);
      if (!integration) {
        return { valid: false, error: 'No integration found' };
      }

      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      return await adapter.validateCredentials();
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Export exam grades to LMS
   * @param {number} examId - The exam ID
   * @param {string} assignmentId - The LMS assignment ID
   * @returns {Promise<Object>} Export results with success/failure counts
   */
  async exportGradesToLMS(examId, assignmentId) {
    try {
      const examData = await this._getExamGrades(examId);
      const integration = await this.getClassLmsIntegration(examData.classId);
      
      if (!integration) {
        throw new Error('LMS integration not configured for this class');
      }

      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      const gradeData = adapter.formatGradeData(examData.studentScores, examData.totalMarks);

      const result = await adapter.uploadGrades(integration.lmsCourseId, assignmentId, gradeData);

      await this._logIntegrationActivity(examData.classId, integration.lmsType, 'grade_export', {
        examId,
        assignmentId,
        successCount: result.successCount,
        failureCount: result.failureCount
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to export grades: ${error.message}`);
    }
  }

  /**
   * Export exam submissions to LMS
   * @param {number} examId - The exam ID
   * @param {string} assignmentId - The LMS assignment ID
   * @returns {Promise<Object>} Export results with success/failure counts
   */
  async exportSubmissionsToLMS(examId, assignmentId) {
    try {
      const examData = await this._getExamGrades(examId);
      const integration = await this.getClassLmsIntegration(examData.classId);
      
      if (!integration) {
        throw new Error('LMS integration not configured for this class');
      }

      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      const submissions = await this._getExamSubmissions(examId);

      const results = [];
      const errors = [];

      for (const submission of submissions) {
        try {
          const submissionData = adapter.formatSubmissionData(
            submission.pdfBuffer,
            submission.filename,
            submission.student_id
          );

          const result = await adapter.uploadSubmission(
            integration.lmsCourseId,
            assignmentId,
            submission.student_id,
            submissionData
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

      const finalResult = {
        successful: results,
        failed: errors,
        total: submissions.length,
        successCount: results.length,
        failureCount: errors.length
      };

      await this._logIntegrationActivity(examData.classId, integration.lmsType, 'submission_export', {
        examId,
        assignmentId,
        successCount: finalResult.successCount,
        failureCount: finalResult.failureCount
      });

      return finalResult;
    } catch (error) {
      throw new Error(`Failed to export submissions: ${error.message}`);
    }
  }

  async _getExamGrades(examId) {
    const examQuery = `
      SELECT e.exam_id, e.exam_title, e.total_marks, e.class_id
      FROM exam e
      WHERE e.exam_id = $1
    `;
    const examResult = await pool.query(examQuery, [examId]);

    if (examResult.rows.length === 0) {
      throw new Error('Exam not found');
    }

    const exam = examResult.rows[0];

    const gradesQuery = `
      SELECT sr.student_id, s.name, sr.grade
      FROM studentResults sr
      JOIN student s ON sr.student_id = s.student_id
      WHERE sr.exam_id = $1 AND sr.grade IS NOT NULL
    `;
    const gradesResult = await pool.query(gradesQuery, [examId]);

    return {
      classId: exam.class_id,
      examTitle: exam.exam_title,
      totalMarks: exam.total_marks,
      studentScores: gradesResult.rows
    };
  }

  async _getExamSubmissions(examId) {
    const query = `
      SELECT sr.student_id, s.name, sr.image_uuids
      FROM studentResults sr
      JOIN student s ON sr.student_id = s.student_id
      WHERE sr.exam_id = $1 AND sr.image_uuids IS NOT NULL
    `;
    const result = await pool.query(query, [examId]);

    const submissions = [];
    for (const row of result.rows) {
      if (row.image_uuids && Object.keys(row.image_uuids).length > 0) {
        const pdfBuffer = await this._generateStudentSubmissionPDF(examId, row.student_id, row.image_uuids);
        submissions.push({
          student_id: row.student_id,
          student_name: row.name,
          filename: `exam_${examId}_student_${row.student_id}_${row.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
          pdfBuffer
        });
      }
    }

    return submissions;
  }

  async _generateStudentSubmissionPDF(examId, studentId, imageUuids) {
    try {
      const response = await fetch("http://flaskomr:5000/generate_student_pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exam_id: examId,
          student_id: studentId,
          image_uuids: imageUuids
        })
      });

      if (!response.ok) {
        throw new Error(`PDF generation failed: ${response.statusText}`);
      }

      return await response.buffer();
    } catch (error) {
      throw new Error(`Failed to generate PDF for student ${studentId}: ${error.message}`);
    }
  }

  async _logIntegrationActivity(userId, lmsType, activityType, details) {
    try {
      const query = `
        INSERT INTO lms_integration_logs (user_id, lms_type, activity_type, details, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `;
      await pool.query(query, [userId, lmsType, activityType, JSON.stringify(details)]);
    } catch (error) {
      console.error('Failed to log integration activity:', error);
    }
  }

  async getUserIntegrations(userId) {
    try {
      const query = `
        SELECT lms_type, created_at, updated_at
        FROM lms_integrations
        WHERE user_id = $1
      `;
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get user integrations: ${error.message}`);
    }
  }

  /**
   * Remove LMS integration for a class
   * @param {number} classId - The class ID
   * @returns {Promise<boolean>} True if integration was removed
   */
  async removeClassLmsIntegration(classId) {
    try {
      const query = `
        DELETE FROM lms_integrations
        WHERE class_id = $1
        RETURNING integration_id
      `;
      const result = await pool.query(query, [classId]);
      return result.rows.length > 0;
    } catch (error) {
      throw new Error(`Failed to remove integration: ${error.message}`);
    }
  }

  /**
   * Store exam assignment integration
   * @param {number} examId - The exam ID
   * @param {string} lmsAssignmentId - The LMS assignment ID
   * @returns {Promise<number>} The integration ID
   */
  async storeExamLmsAssignment(examId, lmsAssignmentId) {
    try {
      const query = `
        INSERT INTO exam_lms_integrations (exam_id, lms_assignment_id)
        VALUES ($1, $2)
        ON CONFLICT (exam_id)
        DO UPDATE SET
          lms_assignment_id = EXCLUDED.lms_assignment_id
        RETURNING integration_id
      `;

      const result = await pool.query(query, [examId, lmsAssignmentId]);
      return result.rows[0].integration_id;
    } catch (error) {
      throw new Error(`Failed to store exam assignment integration: ${error.message}`);
    }
  }

  /**
   * Get exam assignment integration
   * @param {number} examId - The exam ID
   * @returns {Promise<Object|null>} The assignment integration or null if not found
   */
  async getExamLmsAssignment(examId) {
    try {
      const query = `
        SELECT lms_assignment_id
        FROM exam_lms_integrations
        WHERE exam_id = $1
      `;

      const result = await pool.query(query, [examId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return { 
        lmsAssignmentId: result.rows[0].lms_assignment_id 
      };
    } catch (error) {
      throw new Error(`Failed to retrieve exam assignment integration: ${error.message}`);
    }
  }

  /**
   * Remove exam assignment integration
   * @param {number} examId - The exam ID
   * @returns {Promise<boolean>} True if integration was removed
   */
  async removeExamLmsAssignment(examId) {
    try {
      const query = `
        DELETE FROM exam_lms_integrations
        WHERE exam_id = $1
        RETURNING integration_id
      `;
      const result = await pool.query(query, [examId]);
      return result.rows.length > 0;
    } catch (error) {
      throw new Error(`Failed to remove exam assignment integration: ${error.message}`);
    }
  }
}

module.exports = new LMSIntegrationService();