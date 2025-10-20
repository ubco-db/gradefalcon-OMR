const { PatchCustomDomainsByIdRequestCustomClientIpHeaderEnum } = require("auth0");
const pool = require("../utils/db"); // Database connection pool
const axios = require("axios"); // HTTP client for making requests
const auth0Domain = process.env.AUTH0_DOMAIN; // Auth0 domain from environment variables
const clientId = process.env.AUTH0_M2M_CLIENT_ID;
const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET

const audience = `https://${auth0Domain}/api/v2/`; // Auth0 Management API audience
// TODO: refactor in ts and reuse the auth0.service.ts
// Rate limiting utility functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiter class for Auth0 API calls
class Auth0RateLimiter {
  constructor() {
    this.lastCall = 0;
    this.minInterval = 600; // 600ms between calls (slightly under 2 requests per second)
  }

  async waitForNextCall() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      await delay(waitTime);
    }
    this.lastCall = Date.now();
  }
}

const auth0RateLimiter = new Auth0RateLimiter();

// Wrapper function for Auth0 API calls with rate limiting and retry logic
const makeAuth0Request = async (requestFn, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await auth0RateLimiter.waitForNextCall();
      return await requestFn();
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`Rate limit hit on attempt ${attempt}. Waiting before retry...`);
        await delay(Math.pow(2, attempt) * 1000); // Exponential backoff
        if (attempt === maxRetries) {
          throw new Error(`Rate limit exceeded after ${maxRetries} attempts`);
        }
        continue;
      }
      throw error;
    }
  }
};

// Generates a random password with a specified character set
// make sure it satisty the password policy
// the policy could be changed on auth0 dashboard
// Database Connections-> Username-Password-Authentication -> Password -> policies
const generateRandomPassword = () => {
  const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
  const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const specialChars = '!@#$%^&*';
  
  // Ensure at least one character from each required category
  let password = '';
  password += lowerCase.charAt(Math.floor(Math.random() * lowerCase.length));
  password += upperCase.charAt(Math.floor(Math.random() * upperCase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));
  
  // Fill remaining characters (minimum 8 total, we'll use 12 for security)
  const allChars = lowerCase + upperCase + numbers + specialChars;
  for (let i = password.length; i < 12; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  // Shuffle the password to avoid predictable patterns
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Retrieves an access token for the Auth0 Management API
const getManagementApiAccessToken = async () => {
  const options = {
    method: "POST",
    url: `https://${auth0Domain}/oauth/token`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: audience,
      scope: "create:users read:users update:users read:roles create:role_members",
    }),
  };

  try {
    const response = await axios.request(options);
    return response.data.access_token;
  } catch (error) {
    console.error("Error fetching Auth0 Management API token:", error);
    throw new Error("Error fetching Auth0 Management API token");
  }
};

// Displays classes for the authenticated instructor
const displayClasses = async (req, res, next) => {
  try {
    const instructorAuth0Id = req.auth.sub; // Get the instructor ID from the JWT
    const result = await pool.query("SELECT * FROM classes WHERE instructor_id = $1 ORDER BY active DESC", [instructorAuth0Id]);
    res.json(result.rows); // Send the list of classes as JSON
  } catch (err) {
    console.error("Error in displayClasses:", err); // Log any errors
    next(err);
  }
};

// Retrieves the name of a specific class by its ID
const getClassNameById = async (req, res, next) => {
  try {
    const { classId } = req.params; // Get the class ID from the request parameters

    const result = await pool.query("SELECT course_name FROM classes WHERE class_id = $1", [classId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Class not found" });
    }

    res.json({ course_name: result.rows[0].course_name }); // Send the class name as JSON
  } catch (err) {
    next(err);
  }
};

// Displays students enrolled in a class along with their exam grades
const displayClassManagement = async (req, res, next) => {
  try {
    const { class_id } = req.params; // Get the class ID from the request parameters
    const result = await pool.query("SELECT student_id, name FROM enrollment JOIN student USING (student_id) WHERE class_id = $1", [
      class_id,
    ]);
    const classData = result.rows;
    // Only get exams of the current class
    const examResults = classData.map((student) =>
      pool.query("SELECT exam_id, grade FROM studentResults JOIN exam USING (exam_id) WHERE student_id = $1 AND class_id = $2", [student.student_id, class_id]).then((result) => ({
        student_id: student.student_id,
        name: student.name,
        exams: result.rows, // This will be an array of exam results
      }))
    );

    // Wait for all promises to resolve
    const combinedResults = await Promise.all(examResults);
    // Now let's get the course code and course name given class_id
    const courseQuery = await pool.query("SELECT course_id, course_name FROM classes WHERE class_id = $1", [class_id]);
    const courseDetails = courseQuery.rows;
    // Combine the students info and course details
    res.json({ studentInfo: combinedResults, courseDetails });
  } catch (error) {
    next(error);
  }
};

// Imports a class and its students
const importClass = async (req, res) => {
  const { students, courseName, courseId } = req.body;
  const instructorId = req.auth.sub; // Retrieve instructor ID from JWT

  if (!instructorId) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (students.length > 500) {
    return res.status(400).json({ message: "Cannot import more than 500 students at once" });
  }

  const results = {
    successful: [],
    failed: [],
    existing: [],
  };

  try {
    const managementApiToken = await getManagementApiAccessToken();

    // get student role with rate limiting
    const getStudentRoleId = async (managementApiToken) => {
      return await makeAuth0Request(async () => {
        const response = await axios.get(
          `https://${auth0Domain}/api/v2/roles`,
          {
            headers: {
              Authorization: `Bearer ${managementApiToken}`,
            },
          }
        );
        const studentRole = response.data.find(r => r.name === "Student");
        return studentRole?.id;
      });
    };
    
    const studentRoleId = await getStudentRoleId(managementApiToken);
    if (!studentRoleId) {
      return res.status(500).json({
        message: "Auth0 role 'student' not found. Please create it in Auth0 before importing classes.",
      });
    }

    // class creation 
    let classQuery = await pool.query("SELECT class_id FROM classes WHERE course_id = $1 AND instructor_id = $2", [
      courseId,
      instructorId,
    ]);

    let classId;
    if (classQuery.rows.length === 0) {
      const newClassQuery = await pool.query("INSERT INTO classes (course_id, instructor_id, course_name, active) VALUES ($1, $2, $3, $4) RETURNING class_id", [courseId, instructorId, courseName, true]);
      classId = newClassQuery.rows[0].class_id;
    } else {
      classId = classQuery.rows[0].class_id;
    }

    // Process students sequentially to avoid rate limits
    const processedStudents = [];
    
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      console.log(`Processing student ${i + 1}/${students.length}: ${student.studentID}`);
      
      try {
        // Validate required fields
        if (!student.studentID || !student.studentEmail || !student.studentName) {
          console.error(`Missing required student data: ${JSON.stringify(student)}`);
          results.failed.push({
            student: student,
            error: `Missing required student data`
          });
          continue;
        }

        console.log(`Processing student: ${student.studentID} - ${student.studentName} - ${student.studentEmail}`);

        const password = generateRandomPassword();
        const userData = {
          email: student.studentEmail,
          password,
          connection: "Username-Password-Authentication",
          user_metadata: {
            studentID: student.studentID,
            name: student.studentName,
          },
        };

        let auth0User;
        let isNewUser = false;

        // try to create new user in auth0 with rate limiting
        try {
          auth0User = await makeAuth0Request(async () => {
            const userResponse = await axios.post(`https://${auth0Domain}/api/v2/users`, userData, {
              headers: { Authorization: `Bearer ${managementApiToken}` },
            });
            return userResponse.data;
          });
          isNewUser = true;
          console.log(`Created new Auth0 user: ${auth0User.user_id}`);
        } catch (error) {
          // if user exists then fetch with rate limiting
          if (error.response?.status === 409) {
            auth0User = await makeAuth0Request(async () => {
              const existingUsersResponse = await axios.get(`https://${auth0Domain}/api/v2/users-by-email`, {
                params: { email: student.studentEmail },
                headers: { Authorization: `Bearer ${managementApiToken}` },
              });
              return existingUsersResponse.data[0];
            });
            
            if (!auth0User) {
              throw new Error('User not found in auth0 after failure to create');
            }
            console.log(`Found existing Auth0 user: ${auth0User.user_id}`);
          } else {
            throw new Error(error.response?.data?.message || error.message);
          }
        }

        // Check for roles with rate limiting
        const userRoles = await makeAuth0Request(async () => {
          const rolesResponse = await axios.get(
            `https://${auth0Domain}/api/v2/users/${auth0User.user_id}/roles`,
            {
              headers: { Authorization: `Bearer ${managementApiToken}` },
            }
          );
          return rolesResponse.data;
        });

        // If no roles, assign student role with rate limiting
        if (userRoles.length === 0) {
          await makeAuth0Request(async () => {
            await axios.post(
              `https://${auth0Domain}/api/v2/users/${auth0User.user_id}/roles`,
              {
                roles: [studentRoleId],
              },
              {
                headers: { Authorization: `Bearer ${managementApiToken}` },
              }
            );
          });
          console.log(`Assigned student role to user: ${auth0User.user_id}`);
        }

        // insert/update student in database
        console.log(`About to insert/update student with ID: ${student.studentID}`);
        const studentQuery = await pool.query("SELECT * FROM student WHERE student_id = $1::text", [student.studentID]);
        
        if (studentQuery.rows.length === 0) {
          const insertResult = await pool.query("INSERT INTO student (student_id, auth0_id, email, name) VALUES ($1, $2, $3, $4) RETURNING *", [
            student.studentID,
            auth0User.user_id,
            student.studentEmail,
            student.studentName,
          ]);
          console.log(`Inserted new student:`, insertResult.rows[0]);
        } else {
          // update existing student if needed
          const updateResult = await pool.query("UPDATE student SET auth0_id = $1, email = $2, name = $3 WHERE student_id = $4 RETURNING *", [
            auth0User.user_id,
            student.studentEmail,
            student.studentName,
            student.studentID,
          ]);
          console.log(`Updated existing student:`, updateResult.rows[0]);
        }

        processedStudents.push({ 
          ...student, 
          auth0_id: auth0User.user_id,
          success: true 
        });

      } catch (error) {
        console.error(`Error processing student ${student.studentID}:`, error);
        results.failed.push({
          student: student,
          error: error.message
        });
      }
    }

    console.log(`Successfully processed ${processedStudents.length} students out of ${students.length}`);

    // Insert enrollments for successful students
    for (const student of processedStudents) {
      try {
        console.log(`Processing enrollment for student: ${student.studentID}`);
        
        if (!student.studentID) {
          throw new Error(`Student ID is null or undefined for student: ${JSON.stringify(student)}`);
        }
        
        const enrollmentQuery = await pool.query("SELECT * FROM enrollment WHERE class_id = $1 AND student_id = $2", [
          classId,
          student.studentID,
        ]);
        
        if (enrollmentQuery.rows.length === 0) {
          const enrollmentResult = await pool.query("INSERT INTO enrollment (class_id, student_id) VALUES ($1, $2) RETURNING *", [classId, student.studentID]);
          console.log(`Enrolled student:`, enrollmentResult.rows[0]);
          results.successful.push(student);
        } else {
          console.log(`Student ${student.studentID} already enrolled in class ${classId}`);
          results.existing.push(student);
        }
      } catch (error) {
        console.error(`Error enrolling student ${student.studentID}:`, error);
        results.failed.push({
          student: student,
          error: `Enrollment failed: ${error.message}`
        });
      }
    }

    console.log('Final import results:', {
      successful: results.successful.length,
      failed: results.failed.length,
      existing: results.existing.length
    });

    res.status(201).json({ 
      message: "Class import completed", 
      results: {
        successful: results.successful.length,
        failed: results.failed.length,
        existing: results.existing.length,
        total: students.length,
        details: results
      }
    });
  } catch (err) {
    console.error("Error importing class:", err);
    res.status(500).json({ message: "Error importing class", error: err.message });
  }
};

// Fetch all courses
const getAllCourses = async (req, res, next) => {
  const auth0_id = req.auth.sub; // Retrieve instructor ID from JWT
  try {
    const result = await pool.query("SELECT class_id, course_id, course_name FROM classes WHERE instructor_id = $1", [auth0_id]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const archiveCourse = async (req, res, next) => {
  const auth0_id = req.auth.sub; // Retrieve instructor ID from JWT
  const { class_id } = req.body; // Get class ID from request body

  try {
    // Update the active status of the course to false (archived)
    const result = await pool.query(
      "UPDATE classes SET active = false WHERE class_id = $1 AND instructor_id = $2 RETURNING *",
      [class_id, auth0_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Course not found or you do not have permission to archive this course." });
    }

    res.json({ message: "Course archived successfully", course: result.rows[0] });
  } catch (err) {
    console.error("Error archiving course:", err);
    next(err);
  }
};

const unarchiveCourse = async (req, res, next) => {
  const auth0_id = req.auth.sub; // Retrieve instructor ID from JWT
  const { class_id } = req.body; // Get class ID from request body

  try {
    // Update the active status of the course to true (unarchived)
    const result = await pool.query(
      "UPDATE classes SET active = true WHERE class_id = $1 AND instructor_id = $2 RETURNING *",
      [class_id, auth0_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Course not found or you do not have permission to unarchive this course." });
    }

    res.json({ message: "Course unarchived successfully", course: result.rows[0] });
  } catch (err) {
    console.error("Error unarchiving course:", err);
    next(err);
  }
};

const deleteCourse = async (req, res, next) => {
  const auth0_id = req.auth.sub; // Retrieve instructor ID from JWT
  const { class_id } = req.body; // Get class ID from request body

  try {
    // Verify that the instructor owns the course
    const courseVerificationResult = await pool.query(
      "SELECT class_id FROM classes WHERE class_id = $1 AND instructor_id = $2",
      [class_id, auth0_id]
    );

    if (courseVerificationResult.rowCount === 0) {
      return res.status(403).json({ message: "Course not found or you do not have permission to delete this course." });
    }

    // Start a transaction to ensure atomicity
    await pool.query('BEGIN');

    // Delete from enrollment
    await pool.query("DELETE FROM enrollment WHERE class_id = $1", [class_id]);

    // Delete from studentResults
    await pool.query(`
      DELETE FROM studentResults 
      WHERE exam_id IN (SELECT exam_id FROM exam WHERE class_id = $1)`,
      [class_id]
    );

    // Delete from scannedExam
    await pool.query(`
      DELETE FROM scannedExam 
      WHERE exam_id IN (SELECT exam_id FROM exam WHERE class_id = $1)`,
      [class_id]
    );

    // Delete from solutions
    await pool.query(`
      DELETE FROM solution 
      WHERE exam_id IN (SELECT exam_id FROM exam WHERE class_id = $1)`,
      [class_id]
    );

    // Delete exams
    await pool.query("DELETE FROM exam WHERE class_id = $1", [class_id]);

    // Delete class
    const classDeleteResult = await pool.query(
      "DELETE FROM classes WHERE class_id = $1 AND instructor_id = $2 RETURNING *",
      [class_id, auth0_id]
    );

    if (classDeleteResult.rowCount === 0) {
      throw new Error("Course not found or you do not have permission to delete this course.");
    }

    // Commit the transaction
    await pool.query('COMMIT');

    res.json({ message: "Course and related exams deleted successfully" });

  } catch (err) {
    // Rollback transaction in case of error
    await pool.query('ROLLBACK');
    console.error("Error deleting course:", err);
    next(err);
  }
};

// Fetch courses that a particular student is enrolled in
const getStudentCourses = async (req, res, next) => {
  try {
    const studentAuth0Id = req.auth.sub; // Get the  ID from the JWT
    console.log(`Fetching courses for student_id: ${studentAuth0Id}`);
    const result = await pool.query(
      `
      SELECT student_id, class_id, course_id, course_name 
      FROM enrollment 
      JOIN classes USING (class_id) 
      JOIN student USING (student_id)
      WHERE auth0_id = $1;
    `,
      [studentAuth0Id]
    );
    console.log(`Courses fetched: ${JSON.stringify(result.rows)}`);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching student courses:", err);
    next(err);
  }
};

module.exports = {
  displayClasses,
  displayClassManagement,
  importClass,
  getClassNameById,
  getAllCourses,
  archiveCourse,
  unarchiveCourse,
  deleteCourse,
  getStudentCourses
};
