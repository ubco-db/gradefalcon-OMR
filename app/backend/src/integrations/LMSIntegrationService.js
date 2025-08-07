// @ts-check
const CanvasAdapter = require('./CanvasAdapter');
const MockLmsAdapter = require('./MockLmsAdapter');
const pool = require('../utils/db');
const { encrypt, decrypt } = require('../utils/crypto');


/**
 * @typedef {import('./LMSAdapter')} LMSAdapter
 */
class LMSIntegrationService {
  constructor() {
    this.adapters = new Map();
    this.registerAdapter('canvas', CanvasAdapter);
    this.registerAdapter('mocklms', MockLmsAdapter);
  }

  registerAdapter(lmsType, AdapterClass) {
    this.adapters.set(lmsType, AdapterClass);
  }

  /**
 * @returns {LMSAdapter}
 */
  createAdapter(lmsType, accessToken, config = {}) {
    const AdapterClass = this.adapters.get(lmsType);
    if (!AdapterClass) {
      throw new Error(`Unsupported LMS type: ${lmsType}`);
    }
    return new AdapterClass(accessToken, config);
  }

  async storeClassLmsIntegration(classId, lmsType, accessToken, lmsCourseId) {
    try {
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

  // TODO[Longsai]: use postgres.js for better case transformation
  // currently the project is using a mixed of camelCase and snake_case
  async exportGradesToLMS(examId, assignmentId) {
    try {
      const examData = await this._getExamGrades(examId);
      const integration = await this.getClassLmsIntegration(examData.classId);
      if (!integration) {
        throw new Error('LMS integration not configured for this class');
      }
      
      // Get instructor ID for logging
      const instructorQuery = `SELECT instructor_id FROM classes WHERE class_id = $1`;
      const instructorResult = await pool.query(instructorQuery, [examData.classId]);
      const instructorId = instructorResult.rows[0]?.instructor_id;
      
      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      
      // Check if any students don't have LMS mapping
      const studentsWithoutLMS = examData.studentScores.filter(student => !student.lms_user_id);
      if (studentsWithoutLMS.length > 0) {
        console.warn(`Warning: ${studentsWithoutLMS.length} students don't have LMS integration mapping:`, 
          studentsWithoutLMS.map(s => ({ student_id: s.student_id, name: s.name })));
      }
      
      // Filter students with LMS mapping before sending to adapter
      const studentsWithLMS = examData.studentScores.filter(student => student.lms_user_id);
      if (studentsWithLMS.length === 0) {
        throw new Error('No students with LMS integration mapping found. Please import students from LMS first.');
      }
      
      const result = await adapter.uploadGrades(integration.lmsCourseId, assignmentId, studentsWithLMS);
      await this._logIntegrationActivity(instructorId || "", integration.lmsType, 'grade_export', {
        examId,
        assignmentId,
        classId: examData.classId,
        successCount: result.successCount,
        failureCount: result.failureCount
      });
      return result;
    } catch (error) {
      throw new Error(`Failed to export grades: ${error.message}`);
    }
  }

  async exportSubmissionsToLMS(examId, assignmentId) {
    try {
      const examData = await this._getExamGrades(examId);
      const integration = await this.getClassLmsIntegration(examData.classId);
      if (!integration) {
        throw new Error('LMS integration not configured for this class');
      }
      
      // Get instructor ID for logging
      const instructorQuery = `SELECT instructor_id FROM classes WHERE class_id = $1`;
      const instructorResult = await pool.query(instructorQuery, [examData.classId]);
      const instructorId = instructorResult.rows[0]?.instructor_id;
      
      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      const submissions = await this._getExamSubmissions(examId);
      
      if (submissions.length === 0) {
        const examQuery = `SELECT COUNT(*) as total FROM studentResults WHERE exam_id = $1 AND image_uuids IS NOT NULL`;
        const examResult = await pool.query(examQuery, [examId]);
        const totalWithImages = examResult.rows[0].total;
        
        if (totalWithImages > 0) {
          throw new Error(`No submissions with LMS integration mapping found. Found ${totalWithImages} students with scanned images, but none have LMS integration. Please import students from LMS first.`);
        } else {
          throw new Error('No submissions found. Please ensure the exam has been scanned and students have submission images.');
        }
      }
      
      const results = [];
      const errors = [];
      for (const submission of submissions) {
        try {
          const result = await adapter.uploadSubmission(
            integration.lmsCourseId,
            assignmentId,
            submission
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
            lms_user_id: submission.lms_user_id,
            student_name: submission.student_name,
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
      await this._logIntegrationActivity(instructorId || "", integration.lmsType, 'submission_export', {
        examId,
        assignmentId,
        classId: examData.classId,
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
    
    // Get the LMS type for this class to join with correct LMS integration
    const integrationQuery = `
      SELECT lms_type FROM lms_integrations WHERE class_id = $1
    `;
    const integrationResult = await pool.query(integrationQuery, [exam.class_id]);
    if (integrationResult.rows.length === 0) {
      throw new Error('No LMS integration found for this class');
    }
    const lmsType = integrationResult.rows[0].lms_type;
    
    // Updated query to include LMS user ID mapping
    const gradesQuery = `
      SELECT sr.student_id, s.name, sr.grade, sli.lms_user_id
      FROM studentResults sr
      JOIN student s ON sr.student_id = s.student_id
      LEFT JOIN student_lms_integration sli ON sr.student_id = sli.student_id AND sli.lms_type = $2
      WHERE sr.exam_id = $1 AND sr.grade IS NOT NULL
    `;
    const gradesResult = await pool.query(gradesQuery, [examId, lmsType]);
    return {
      classId: exam.class_id,
      examTitle: exam.exam_title,
      totalMarks: exam.total_marks,
      studentScores: gradesResult.rows
    };
  }

  /**
   * Retrieves and generates PDF submissions for all students who have submitted images for a given exam,
   * including only those students who have an LMS integration mapping for the relevant LMS type.
   *
   * @async
   * @param {number|string} examId - The unique identifier of the exam.
   * @returns {Promise<Array<{student_id: number, lms_user_id: string, student_name: string, filename: string, pdfBuffer: Buffer}>>}
   *   An array of objects containing student submission details and generated PDF buffers.
   * @throws {Error} If the exam is not found or there is no LMS integration for the class.
   */
  async _getExamSubmissions(examId) {
    // Get the LMS type for this class to join with correct LMS integration
    const examQuery = `SELECT class_id FROM exam WHERE exam_id = $1`;
    const examResult = await pool.query(examQuery, [examId]);
    if (examResult.rows.length === 0) {
      throw new Error('Exam not found');
    }
    const classId = examResult.rows[0].class_id;

    const integrationQuery = `SELECT lms_type FROM lms_integrations WHERE class_id = $1`;
    const integrationResult = await pool.query(integrationQuery, [classId]);
    if (integrationResult.rows.length === 0) {
      throw new Error('No LMS integration found for this class');
    }
    const lmsType = integrationResult.rows[0].lms_type;

    const query = `
      SELECT sr.student_id, s.name, sr.image_uuids, sli.lms_user_id
      FROM studentResults sr
      JOIN student s ON sr.student_id = s.student_id
      LEFT JOIN student_lms_integration sli ON sr.student_id = sli.student_id AND sli.lms_type = $2
      WHERE sr.exam_id = $1 AND sr.image_uuids IS NOT NULL
    `;
    const result = await pool.query(query, [examId, lmsType]);
    const submissions = [];
    const skippedStudents = [];
    
    for (const row of result.rows) {
      if (row.image_uuids && Object.keys(row.image_uuids).length > 0) {
        // Only include students with LMS integration
        if (row.lms_user_id) {
          const pdfBuffer = await this._generateStudentSubmissionPDF(examId, row.student_id, row.image_uuids);
          submissions.push({
            student_id: row.student_id,
            lms_user_id: row.lms_user_id,
            student_name: row.name,
            filename: `exam_${examId}_student_${row.student_id}_${row.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
            pdfBuffer
          });
        } else {
          skippedStudents.push({ student_id: row.student_id, name: row.name });
          console.warn(`Skipping student ${row.student_id} (${row.name}) - no LMS integration mapping`);
        }
      }
    }
    
    if (skippedStudents.length > 0) {
      console.log(`Summary: Processed ${submissions.length} students, skipped ${skippedStudents.length} students without LMS mapping:`, 
        skippedStudents.map(s => `${s.name} (ID: ${s.student_id})`).join(', '));
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
        const errorText = await response.text();
        throw new Error(`PDF generation failed (${response.status}): ${errorText}`);
      }
      
      // Check if response is PDF or JSON error
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(`PDF generation failed: ${(errorData && errorData['error']) || 'Unknown error'}`);
      }
      
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new Error(`Failed to generate PDF for student ${studentId}: ${error.message}`);
    }
  }

  /**
   * Logs LMS integration activity for auditing or debugging purposes.
   * @private
   * @param {string} userId
   * @param {string} lmsType
   * @param {string} activityType
   * @param {object} details
   * @returns {Promise<void>}
   */
  async _logIntegrationActivity(userId, lmsType, activityType, details) {
    console.log(`LMS Activity Log [${activityType}]:`, {
      userId, lmsType, details
    });
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

  async createAssignment(classId, assignmentData) {
    try {
      const integration = await this.getClassLmsIntegration(classId);
      if (!integration) {
        throw new Error('LMS integration not configured for this class');
      }
      
      // Get instructor ID for logging
      const instructorQuery = `SELECT instructor_id FROM classes WHERE class_id = $1`;
      const instructorResult = await pool.query(instructorQuery, [classId]);
      const instructorId = instructorResult.rows[0]?.instructor_id;
      
      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      const result = await adapter.createAssignment(integration.lmsCourseId, assignmentData);
      await this._logIntegrationActivity(instructorId || "", integration.lmsType, 'assignment_creation', {
        assignmentId: result.id,
        assignmentName: result.name,
        pointsPossible: result.pointsPossible,
        classId: classId
      });
      return result;
    } catch (error) {
      throw new Error(`Failed to create assignment: ${error.message}`);
    }
  }

  getAvailableLmsTypes() {
    const lmsTypes = [];
    for (const [id, AdapterClass] of this.adapters) {
      lmsTypes.push({
        id: id,
        name: this._getLmsDisplayName(id)
      });
    }
    return lmsTypes;
  }

  _getLmsDisplayName(lmsType) {
    const displayNames = {
      'canvas': 'Canvas',
      'mocklms': 'Mock LMS (Testing)'
    };
    return displayNames[lmsType] || lmsType.charAt(0).toUpperCase() + lmsType.slice(1);
  }

  async getLmsStudents(classId) {
    try {
      const integration = await this.getClassLmsIntegration(classId);
      if (!integration) {
        throw new Error('LMS integration not configured for this class');
      }
      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      const students = await adapter.getStudents(integration.lmsCourseId);
      return students;
    } catch (error) {
      throw new Error(`Failed to get students from LMS: ${error.message}`);
    }
  }

  async saveLmsStudents(classId, students) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const integration = await this.getClassLmsIntegration(classId);
      if (!integration) {
        throw new Error('LMS integration not configured for this class');
      }
      for (const student of students) {
        // Insert or update student
        const studentQuery = {
          text: 'INSERT INTO student (student_id, auth0_id, email, name) VALUES ($1, $2, $3, $4) ON CONFLICT (student_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name',
          values: [student.student_id, `lms|${student.lms_user_id}`, student.email, student.name],
        };
        await client.query(studentQuery);

        // Insert or update LMS integration
        const integrationQuery = {
          text: 'INSERT INTO student_lms_integration (student_id, lms_user_id, lms_type) VALUES ($1, $2, $3) ON CONFLICT (student_id, lms_type) DO UPDATE SET lms_user_id = EXCLUDED.lms_user_id',
          values: [student.student_id, student.lms_user_id, integration.lmsType],
        };
        await client.query(integrationQuery);

        // Check if enrollment exists, if not insert it
        const enrollmentCheckQuery = {
          text: 'SELECT 1 FROM enrollment WHERE class_id = $1 AND student_id = $2',
          values: [classId, student.student_id],
        };
        const enrollmentCheck = await client.query(enrollmentCheckQuery);
        
        if (enrollmentCheck.rows.length === 0) {
          const enrollmentQuery = {
            text: 'INSERT INTO enrollment (class_id, student_id) VALUES ($1, $2)',
            values: [classId, student.student_id],
          };
          await client.query(enrollmentQuery);
        }
      }
      await client.query('COMMIT');
      return { success: true, message: 'Students saved successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Failed to save students: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = new LMSIntegrationService();
