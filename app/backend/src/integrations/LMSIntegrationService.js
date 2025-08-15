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
        return { valid: false, error: 'No LMS integration found for this class' };
      }
      
      const adapter = this.createAdapter(integration.lmsType, integration.accessToken);
      
      // Step 1: Validate credentials
      const credentialsResult = await adapter.validateCredentials();
      if (!credentialsResult.valid) {
        return credentialsResult;
      }
      
      // Step 2: Test actual LMS connectivity by fetching courses
      try {
        const courses = await adapter.getCourses();
        if (!courses || courses.length === 0) {
          return { 
            valid: false, 
            error: 'Token is valid but no courses found. Make sure you have instructor access to at least one course.' 
          };
        }
        
        // Step 3: If lmsCourseId is set, verify access to that specific course
        if (integration.lmsCourseId) {
          const targetCourse = courses.find(course => course.id.toString() === integration.lmsCourseId.toString());
          if (!targetCourse) {
            return {
              valid: false,
              error: `Course ID ${integration.lmsCourseId} not found in your accessible courses. Please check the course ID or ensure you have instructor access.`
            };
          }
          
          // Step 4: Test student access for the specific course
          try {
            const students = await adapter.getStudents(integration.lmsCourseId);
            return {
              valid: true,
              message: `Successfully validated LMS integration. Found ${courses.length} accessible courses and ${students.length} students in the configured course "${targetCourse.name}".`,
              details: {
                coursesCount: courses.length,
                studentsCount: students.length,
                targetCourse: targetCourse
              }
            };
          } catch (studentsError) {
            return {
              valid: false,
              error: `Access to course "${targetCourse.name}" verified, but unable to fetch students: ${studentsError.message}`
            };
          }
        } else {
          return {
            valid: true,
            message: `Successfully validated LMS integration. Found ${courses.length} accessible courses. Configure a course ID to complete the setup.`,
            details: {
              coursesCount: courses.length,
              availableCourses: courses.slice(0, 5) // Show first 5 courses as preview
            }
          };
        }
        
      } catch (connectivityError) {
        return {
          valid: false,
          error: `Token is valid but LMS connectivity test failed: ${connectivityError.message}`
        };
      }
      
    } catch (error) {
      return { 
        valid: false, 
        error: `Validation failed: ${error.message}` 
      };
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

      // Import Auth0Service for proper Auth0 integration
      const { Auth0Service } = require('../services/auth0.service');
      const auth0Service = new Auth0Service();

      const results = {
        successful: [],
        failed: [],
        total: students.length
      };

      // Pre-validation: Check for duplicates within the import batch
      const studentIds = new Set();
      const emails = new Set();
      const duplicateErrors = [];

      for (const student of students) {
        // Check for missing required fields
        if (!student.student_id || !student.email || !student.name || !student.lms_user_id) {
          duplicateErrors.push(`Missing required fields for student: ${student.name || 'Unknown'}`);
          continue;
        }

        // Check for duplicate student IDs within the batch
        if (studentIds.has(student.student_id)) {
          duplicateErrors.push(`Duplicate student ID in import batch: ${student.student_id}`);
        } else {
          studentIds.add(student.student_id);
        }

        // Check for duplicate emails within the batch
        const normalizedEmail = student.email.toLowerCase().trim();
        if (emails.has(normalizedEmail)) {
          duplicateErrors.push(`Duplicate email in import batch: ${student.email}`);
        } else {
          emails.add(normalizedEmail);
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) {
          duplicateErrors.push(`Invalid email format for student: ${student.name} (${student.email})`);
        }
      }

      // If we found batch validation errors, abort the import
      if (duplicateErrors.length > 0) {
        await client.query('ROLLBACK');
        throw new Error(`Import validation failed:\n${duplicateErrors.join('\n')}`);
      }

      // Check for conflicts with existing students in the database
      const existingStudentIds = new Set();
      const existingEmails = new Set();
      const studentsToSkip = [];
      
      for (const studentId of studentIds) {
        const existingStudent = await client.query('SELECT student_id, email FROM student WHERE student_id = $1', [studentId]);
        if (existingStudent.rows.length > 0) {
          existingStudentIds.add(studentId);
          const student = students.find(s => s.student_id === studentId);
          if (student) {
            studentsToSkip.push({
              student_id: studentId,
              name: student.name,
              email: student.email,
              reason: 'Student ID already exists in database'
            });
          }
        }
      }

      for (const email of emails) {
        const existingEmailCheck = await client.query('SELECT student_id, email FROM student WHERE LOWER(email) = $1', [email]);
        if (existingEmailCheck.rows.length > 0) {
          existingEmails.add(email);
          // Check if this email belongs to a different student ID
          const conflictingStudent = existingEmailCheck.rows[0];
          const importStudent = students.find(s => s.email.toLowerCase().trim() === email);
          if (importStudent && conflictingStudent.student_id !== importStudent.student_id) {
            duplicateErrors.push(`Email ${email} is already used by student ID ${conflictingStudent.student_id}, cannot assign to ${importStudent.student_id}`);
          }
        }
      }

      // If we found database conflicts that aren't just updates, report them
      if (duplicateErrors.length > 0) {
        await client.query('ROLLBACK');
        throw new Error(`Import conflicts found:\n${duplicateErrors.join('\n')}`);
      }

      // Separate students into new vs existing
      const studentsToCreate = students.filter(student => !existingStudentIds.has(student.student_id));
      const studentsToEnroll = students.filter(student => existingStudentIds.has(student.student_id));

      console.log(`Pre-validation complete: ${students.length} students found in LMS`);
      console.log(`Existing students (enrollment only): ${existingStudentIds.size}`);
      console.log(`New students (create + enrollment): ${studentsToCreate.length}`);

      // Process new students (create student record + LMS integration + enrollment)
      for (const student of studentsToCreate) {
        try {
          // Student data is already validated in pre-validation phase
          
          // Try to find existing user in Auth0 by email
          let auth0User = null;
          try {
            auth0User = await auth0Service.getUserByEmail(student.email);
          } catch (findError) {
            console.warn(`Could not search for existing user in Auth0: ${findError.message}`);
          }

          // If user doesn't exist in Auth0, create them
          if (!auth0User) {
            try {
              console.log(`Creating new Auth0 user for ${student.email}`);
              auth0User = await auth0Service.createUser(student.email, student.name);
              if (auth0User) {
                console.log(`Successfully created Auth0 user: ${auth0User.auth0_id}`);
                
                // Assign student role to newly created user
                try {
                  await auth0Service.ensureStudentRole(auth0User.auth0_id);
                  console.log(`Assigned student role to new user: ${auth0User.auth0_id}`);
                } catch (roleError) {
                  console.warn(`Failed to assign student role to ${auth0User.auth0_id}: ${roleError.message}`);
                }
              }
            } catch (createError) {
              // If user creation fails, we'll continue with a placeholder but log the error
              console.error(`Failed to create Auth0 user for ${student.email}: ${createError.message}`);
              auth0User = {
                auth0_id: `pending_auth0|${student.email}`,
                email: student.email,
                name: student.name
              };
            }
          } else {
            console.log(`Found existing Auth0 user: ${auth0User.auth0_id}`);
            
            // For existing users, ensure they have student role if they don't have any roles
            try {
              await auth0Service.ensureStudentRole(auth0User.auth0_id);
            } catch (roleError) {
              console.warn(`Failed to ensure student role for existing user ${auth0User.auth0_id}: ${roleError.message}`);
            }
          }

          // Insert new student (we've already filtered out existing ones)
          try {
            const insertStudentQuery = {
              text: 'INSERT INTO student (student_id, auth0_id, email, name) VALUES ($1, $2, $3, $4)',
              values: [student.student_id, auth0User.auth0_id, student.email, student.name],
            };
            await client.query(insertStudentQuery);
            console.log(`Inserted new student: ${student.student_id}`);
          } catch (insertError) {
            // Handle unique constraint violations
            if (insertError.code === '23505') {
              if (insertError.constraint === 'student_pkey' || insertError.constraint === 'student_student_id_unique') {
                throw new Error(`Student ID ${student.student_id} already exists`);
              } else if (insertError.constraint === 'student_email_unique') {
                throw new Error(`Email ${student.email} is already in use by another student`);
              }
            }
            throw insertError;
          }

          // Insert or update LMS integration mapping
          const integrationQuery = {
            text: `INSERT INTO student_lms_integration (student_id, lms_user_id, lms_type) 
                   VALUES ($1, $2, $3) 
                   ON CONFLICT (student_id, lms_type) 
                   DO UPDATE SET lms_user_id = EXCLUDED.lms_user_id`,
            values: [student.student_id, student.lms_user_id, integration.lmsType],
          };
          await client.query(integrationQuery);

          // Check if enrollment exists for this class
          const enrollmentCheckQuery = {
            text: 'SELECT 1 FROM enrollment WHERE class_id = $1 AND student_id = $2',
            values: [classId, student.student_id],
          };
          const enrollmentCheck = await client.query(enrollmentCheckQuery);
          
          if (enrollmentCheck.rows.length === 0) {
            // Insert new enrollment
            const enrollmentQuery = {
              text: 'INSERT INTO enrollment (class_id, student_id) VALUES ($1, $2)',
              values: [classId, student.student_id],
            };
            await client.query(enrollmentQuery);
          }

          results.successful.push({
            student_id: student.student_id,
            name: student.name,
            email: student.email,
            lms_user_id: student.lms_user_id,
            auth0_id: auth0User.auth0_id,
            status: 'created',
            auth0_created: !auth0User.auth0_id.startsWith('pending_auth0|'),
            needs_auth0_setup: auth0User.auth0_id.startsWith('pending_auth0|'),
            role_assigned: !auth0User.auth0_id.startsWith('pending_auth0|') // Role assignment attempted for valid Auth0 users
          });

        } catch (studentError) {
          console.error(`Error processing student ${student.student_id}:`, studentError);
          results.failed.push({
            student_id: student.student_id || 'Unknown',
            name: student.name || 'Unknown',
            email: student.email || 'Unknown',
            error: studentError.message
          });
        }
      }

      // Process existing students (enrollment only, skip student creation and LMS integration)
      for (const student of studentsToEnroll) {
        try {
          console.log(`Processing enrollment for existing student: ${student.student_id}`);

          // Check if enrollment exists for this class
          const enrollmentCheckQuery = {
            text: 'SELECT 1 FROM enrollment WHERE class_id = $1 AND student_id = $2',
            values: [classId, student.student_id],
          };
          const enrollmentCheck = await client.query(enrollmentCheckQuery);
          
          if (enrollmentCheck.rows.length === 0) {
            // Insert new enrollment
            const enrollmentQuery = {
              text: 'INSERT INTO enrollment (class_id, student_id) VALUES ($1, $2)',
              values: [classId, student.student_id],
            };
            await client.query(enrollmentQuery);
            console.log(`Enrolled existing student ${student.student_id} in class ${classId}`);

            results.successful.push({
              student_id: student.student_id,
              name: student.name,
              email: student.email,
              lms_user_id: student.lms_user_id,
              status: 'enrolled',
              reason: 'Student existed, enrolled in course',
              auth0_created: false,
              needs_auth0_setup: false,
              role_assigned: false
            });
          } else {
            console.log(`Student ${student.student_id} already enrolled in class ${classId}`);

            results.successful.push({
              student_id: student.student_id,
              name: student.name,
              email: student.email,
              lms_user_id: student.lms_user_id,
              status: 'already_enrolled',
              reason: 'Student already enrolled in course',
              auth0_created: false,
              needs_auth0_setup: false,
              role_assigned: false
            });
          }

        } catch (studentError) {
          console.error(`Error enrolling existing student ${student.student_id}:`, studentError);
          results.failed.push({
            student_id: student.student_id || 'Unknown',
            name: student.name || 'Unknown',
            email: student.email || 'Unknown',
            error: studentError.message
          });
        }
      }

      // Only commit if we have at least some successful imports
      if (results.successful.length > 0) {
        await client.query('COMMIT');
        
        const createdCount = results.successful.filter(s => s.status === 'created').length;
        const enrolledCount = results.successful.filter(s => s.status === 'enrolled').length;
        const alreadyEnrolledCount = results.successful.filter(s => s.status === 'already_enrolled').length;
        const auth0CreatedCount = results.successful.filter(s => s.auth0_created).length;
        const needsAuth0SetupCount = results.successful.filter(s => s.needs_auth0_setup).length;
        const roleAssignedCount = results.successful.filter(s => s.role_assigned).length;
        
        // Log the import results
        console.log(`Student import completed for class ${classId}:`, {
          total_from_lms: results.total,
          new_students_created: createdCount,
          existing_students_enrolled: enrolledCount,
          already_enrolled: alreadyEnrolledCount,
          failed: results.failed.length,
          auth0_created: auth0CreatedCount,
          needs_auth0_setup: needsAuth0SetupCount,
          role_assigned: roleAssignedCount
        });

        let message = `Processed ${results.total} students from LMS`;
        if (createdCount > 0) {
          message += `. Created ${createdCount} new students`;
        }
        if (enrolledCount > 0) {
          message += `. Enrolled ${enrolledCount} existing students in course`;
        }
        if (alreadyEnrolledCount > 0) {
          message += `. ${alreadyEnrolledCount} students were already enrolled`;
        }
        if (auth0CreatedCount > 0) {
          message += `. Created ${auth0CreatedCount} new Auth0 users with student roles`;
        }
        if (needsAuth0SetupCount > 0) {
          message += `. Note: ${needsAuth0SetupCount} students need manual Auth0 setup`;
        }

        return { 
          success: true, 
          message: message,
          results: results
        };
      } else {
        await client.query('ROLLBACK');
        throw new Error('No students could be imported successfully. Check the errors and try again.');
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Failed to save students: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = new LMSIntegrationService();
