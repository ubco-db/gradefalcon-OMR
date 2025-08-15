const pool = require("../utils/db");
const fs = require("fs");
const path = require("path");
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Blob } = require('buffer');

// Template cache: in-memory storage for templates
const templateCache = new Map();

// File storage structure: key -> { template, pdfPath, timestamp, courseId, examTitle, classId, userId }
const TEMPLATE_EXPIRATION = 2 * 60 * 60 * 1000; // 2 hours expiration time

// Clean up expired templates and related PDF files
setInterval(() => {
  const now = Date.now();
  for (const [id, resourceData] of templateCache.entries()) {
    if (now - resourceData.timestamp > TEMPLATE_EXPIRATION) {
      // If PDF file exists, try to delete it
      if (resourceData.pdfPath && fs.existsSync(resourceData.pdfPath)) {
        try {
          fs.unlinkSync(resourceData.pdfPath);
          console.log(`PDF file for template ${id} deleted from filesystem`);
        } catch (err) {
          console.error(`Failed to delete PDF file for template ${id}:`, err);
        }
      }

      templateCache.delete(id);
      console.log(`Template ${id} expired and removed from cache with associated resources`);
    }
  }
}, 15 * 60 * 1000); // Clean up every 15 minutes

// Get or create a resource ID based on user ID and exam information
const getResourceIdForUser = (userId, courseId, examTitle, classId) => {
  // Check if a resource already exists for this user and exam
  for (const [id, data] of templateCache.entries()) {
    if (data.userId === userId &&
        data.courseId === courseId &&
        data.examTitle === examTitle &&
        data.classId === classId) {
      return id; // Return existing ID to override
    }
  }

  // No existing resource found, create a new ID
  return uuidv4();
};

/**
 * Helper function to normalize answer data from database
 * Handles new array format: [{type: "mcq", questions: [...]}, {type: "parsons", answerKey: [...]}]
 * @param {Array} rawAnswers - Raw answers from database
 * @returns {Object} - Normalized answer structure { mcq: [], parsons: null }
 */
const normalizeAnswers = (rawAnswers) => {
  if (!rawAnswers || !Array.isArray(rawAnswers)) {
    return { mcq: [], parsons: null };
  }
  
  const normalized = { mcq: [], parsons: null };
  
  // Process array format
  rawAnswers.forEach(section => {
    if (section.type === 'mcq') {
      normalized.mcq = section.questions || [];
    } else if (section.type === 'parsons') {
      normalized.parsons = {
        answerKey: section.answerKey || [],
        maxScore: section.maxScore || 10,
        enabled: section.enabled || false
      };
    }
  });
  
  return normalized;
};

/**
 * Gets the default template JSON for a given template type
 * @param {string} templateType - The type of template (100mcq or 200mcq)
 * @returns {Promise<string>} - A JSON string representing the combined template
 */
const getDefaultTemplate = async (templateType) => {
  const templatesDir = path.join(__dirname, '../assets/templates');
  
  try {
    let templateFiles = [];
    let combinedPages = {};
    
    // Get all files matching the template type pattern
    const files = fs.readdirSync(templatesDir);
    templateFiles = files.filter(file => 
      file.startsWith(templateType) && file.endsWith('.json')
    ).sort(); // Sort to ensure correct order
    
    if (templateFiles.length === 0) {
      throw new Error(`No template files found for type: ${templateType}`);
    }
    
    // Read and combine all template files
    for (let i = 0; i < templateFiles.length; i++) {
      const filePath = path.join(templatesDir, templateFiles[i]);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const templateData = JSON.parse(fileContent);
      
      // Page number is 1-indexed 
      const pageNum = i + 1;
      combinedPages[`page_${pageNum}`] = templateData;
    }
    
    return JSON.stringify(combinedPages);
  } catch (error) {
    console.error(`Error loading default template for ${templateType}:`, error);
    throw error;
  }
};

// New method: Get stored resource (template and PDF)
const getStoredResource = async (req, res) => {
  const { resourceId } = req.params;

  if (!templateCache.has(resourceId)) {
    return res.status(404).json({ message: "Resource not found or expired" });
  }

  const resourceData = templateCache.get(resourceId);

  // Check if PDF file exists
  if (!resourceData.pdfPath || !fs.existsSync(resourceData.pdfPath)) {
    return res.status(404).json({ message: "PDF file not found" });
  }

  try {
    // Set response headers and send PDF file
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resourceData.pdfPath)}"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Template-Data', JSON.stringify(resourceData.template)); // Include template data in response header

    const pdfStream = fs.createReadStream(resourceData.pdfPath);
    pdfStream.pipe(res);

    // Log access but don't delete resource, allowing multiple downloads
    resourceData.lastAccessed = Date.now();
    templateCache.set(resourceId, resourceData);
  } catch (error) {
    console.error('Error serving stored resource:', error);
    res.status(500).json({ message: "Error retrieving resource" });
  }
};

// New method: Finalize stored resource after exam is saved, clean up temporary resource
const finalizeResource = async (req, res) => {
  const { resourceId, examId } = req.body;

  if (!templateCache.has(resourceId)) {
    return res.status(404).json({ message: "Resource not found or expired" });
  }

  try {
    const resourceData = templateCache.get(resourceId);

    // Get target location
    const targetDir = path.join(__dirname, `../assets/exams/exam_${examId}`);
    ensureDirectoryExistence(targetDir);

    // Copy PDF file to final location
    const targetPdfPath = path.join(targetDir, `template_${examId}.pdf`);
    fs.copyFileSync(resourceData.pdfPath, targetPdfPath);

    res.status(200).json({
      message: "Resource finalized successfully",
      pdfPath: targetPdfPath
    });
  } catch (error) {
    console.error('Error finalizing resource:', error);
    res.status(500).json({ message: "Error finalizing resource" });
  }
};

const saveQuestions = async (req, res, next) => {
  const { questions, classID, examTitle, numQuestions, totalMarks, mcqTotalMarks, parsonsTotalMarks, examMaxAppeals, markingSchemes, template, canViewExam, canViewAnswers, templateId, single_choice_only, parsonsAnswerKey, includeParsonsProblem, parsonsMaxScore } = req.body;

  console.log("Received data:", {
    questions: questions ? "Provided" : "Not provided",
    classID,
    examTitle,
    numQuestions,
    totalMarks,
    examMaxAppeals,
    markingSchemes,
    template,
    canViewExam,
    canViewAnswers,
    templateId,
    single_choice_only,
    parsonsAnswerKey: parsonsAnswerKey ? "Provided" : "Not provided",
    includeParsonsProblem,
    parsonsMaxScore
  });

  // Determine template source - from cache or provided in request
  var templateFile = null;

  if (templateId && templateCache.has(templateId)) {
    // Get template from cache
    const templateData = templateCache.get(templateId).template.pages;
    // Convert to JSON string - pages object is sufficient for JSONB type
    templateFile = JSON.stringify(templateData);
    console.log("templateFile", templateFile);
    console.log(`Retrieved template ${templateId} from cache`);
    // TODO: templateId also contains pdf path, can save the pdf template to database
    // Remove from cache after retrieval
  } else if (templateId && template == "custom") {
    console.log(`Template ID ${templateId} provided but not found in cache`);
  } else if (template != "custom") {
    // if template is not custom, use the default template
    templateFile = await getDefaultTemplate(template);
    console.log("using default template for ", template);
  } else {
    return res.status(400).json({ message: "Invalid template" });
  }

  // Ensure examMaxAppeals has a valid value (handle both null and undefined)
  const maxAppeals = examMaxAppeals === null || examMaxAppeals === undefined ? 3 : examMaxAppeals;
  
  // Ensure single_choice_only has a valid value (default to true if not specified)
  const isSingleChoiceOnly = single_choice_only === undefined ? true : !!single_choice_only;
  
  // Validate marking schemes - ensure each question appears only once across all schemes
  if (markingSchemes && markingSchemes.length > 0) {
    const usedQuestions = new Set();
    const duplicateQuestions = [];
    
    markingSchemes.forEach((scheme, schemeIndex) => {
      if (scheme.questions && Array.isArray(scheme.questions)) {
        scheme.questions.forEach(question => {
          if (usedQuestions.has(question)) {
            duplicateQuestions.push(question);
          } else {
            usedQuestions.add(question);
          }
        });
      }
    });
    
    if (duplicateQuestions.length > 0) {
      return res.status(400).json({ 
        message: `Duplicate questions found in marking schemes: ${duplicateQuestions.join(', ')}. Each question can only be assigned to one marking scheme.`
      });
    }
  }
  
  try {
    // Create options object
    const options = JSON.stringify({ canViewExam: canViewExam, canViewAnswers: canViewAnswers });

    // Check if maxAppeals is valid
    if (maxAppeals <= 0) {
        return res.status(400).json({ message: "Max exam appeals must be greater than 0." });
    }
    
    const writeToExam = await pool.query(
      "INSERT INTO exam (class_id, exam_title, total_questions, total_marks, mcq_total_marks, parsons_total_marks, exam_max_appeals, template, template_file, viewing_options) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10) RETURNING exam_id",
      [classID, examTitle, numQuestions, totalMarks, mcqTotalMarks || numQuestions, parsonsTotalMarks || 0, maxAppeals, template, templateFile, options]
    );

    const insertedRowId = writeToExam.rows[0].exam_id;

    // Prepare answer data including Parsons if applicable - using array format
    const answerData = [];
    
    // Add MCQ answers to array
    if (questions && questions.length > 0) {
      answerData.push({
        type: "mcq",
        questions: questions
      });
    }
    
    // Add Parsons data to array if applicable
    if (includeParsonsProblem) {
      answerData.push({
        type: "parsons",
        answerKey: parsonsAnswerKey || [],
        maxScore: parsonsMaxScore || 10,
        enabled: true
      });
    }

    const writeToSolution = await pool.query(
      "INSERT INTO solution (exam_id, answers, marking_schemes, single_choice_only) VALUES ($1, $2, $3, $4)",
      [
        insertedRowId,
        JSON.stringify(answerData),
        JSON.stringify(markingSchemes),
        isSingleChoiceOnly
      ]
    );

    res.status(200).json({ message: "Questions and marking schemes saved successfully." });
  } catch (error) {
    console.error("Error saving questions:", error);
    next(error);
  }
};

// New exam route
const newExam = async (req, res, next) => {
  const { exam_id, student_id, grade } = req.body;

  try {
    const result = await pool.query("INSERT INTO studentResults (exam_id, student_id, grade) VALUES ($1, $2, $3) RETURNING *", [
      exam_id,
      student_id,
      grade,
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};


const examBoard = async (req, res, next) => {
  const instructorId = req.auth.sub; // Get the instructor ID from Auth0 token
  try {
    const classes = await pool.query(
      `
      SELECT 
        exam_id, 
        classes.class_id, 
        exam_title, 
        course_id, 
        course_name, 
        graded 
      FROM exam 
      INNER JOIN classes ON (exam.class_id = classes.class_id) 
      WHERE instructor_id = $1 
      AND classes.active = true  -- Exclude exams from archived (inactive) classes
      `,
      [instructorId]
    );

    res.json({ classes: classes.rows });
  } catch (err) {
    next(err);
  }
};


const getAveragePerExam = async (req, res, next) => {
  const instructorId = req.auth.sub; // Get the instructor ID from Auth0 token
  try {
    const averagePerExamData = await pool.query(
      `
      SELECT e.exam_title AS "examTitle", ROUND(AVG(sr.grade)::numeric, 1) AS "averageScore"
      FROM studentResults sr
      JOIN exam e ON sr.exam_id = e.exam_id
      JOIN classes c ON e.class_id = c.class_id
      WHERE c.instructor_id = $1
      GROUP BY e.exam_title
      ORDER BY e.exam_title
    `,
      [instructorId]
    );

    res.json(averagePerExamData.rows);
  } catch (err) {
    next(err);
  }
};

const getAveragePerCourse = async (req, res, next) => {
  const instructorId = req.auth.sub;
  try {
    const averagePerCourseData = await pool.query(
      `
      SELECT c.course_name AS "courseName", ROUND(AVG(sr.grade)::numeric, 1) AS "averageScore"
      FROM studentResults sr
      JOIN exam e ON sr.exam_id = e.exam_id
      JOIN classes c ON e.class_id = c.class_id
      WHERE c.instructor_id = $1
      GROUP BY c.course_name
      ORDER BY c.course_name
    `,
      [instructorId]
    );

    res.json(averagePerCourseData.rows);
  } catch (err) {
    next(err);
  }
};

const getStudentGrades = async (req, res, next) => {
  const { studentId } = req.params;
  const { classId } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT e.exam_title AS title, 
             CASE 
               WHEN sr.grade IS NULL THEN 'missing' 
               ELSE 'submitted' 
             END AS status, 
             COALESCE(sr.grade, 0) AS score, 
             e.total_marks AS total
      FROM exam e
      LEFT JOIN studentResults sr ON e.exam_id = sr.exam_id AND sr.student_id = $1
      WHERE e.class_id = $2
    `,
      [studentId, classId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const getAnswerKeyForExam = async (exam_id) => {
  try {
    const solutionResult = await pool.query("SELECT answers FROM solution WHERE exam_id = $1", [exam_id]);

    if (solutionResult.rows.length === 0) {
      throw new Error("Solution not found");
    }

    const rawAnswers = solutionResult.rows[0].answers;
    const normalizedAnswers = normalizeAnswers(rawAnswers);
    
    // For backward compatibility, return MCQ answers in the old format
    const mcqAnswersInOrder = normalizedAnswers.mcq.map((answer) => Object.values(answer)[0]);

    return mcqAnswersInOrder;
  } catch (error) {
    console.error("Error getting answer key for exam:", error);
    throw error;
  }
};

const getParsonsAnswerKeyForExam = async (exam_id) => {
  try {
    const solutionResult = await pool.query("SELECT answers FROM solution WHERE exam_id = $1", [exam_id]);
    if (solutionResult.rows.length === 0) {
      throw new Error("Solution not found");
    }
    
    const rawAnswers = solutionResult.rows[0].answers;
    const normalizedAnswers = normalizeAnswers(rawAnswers);
    
    return normalizedAnswers.parsons;
  } catch (error) {
    console.error("Error getting Parsons answer key for exam:", error);
    throw error;
  }
};

const getStudentNameById = async (studentId) => {
  try {
    if (studentId === "") {
      return "Unknown student";
    }
    const result = await pool.query("SELECT name FROM student WHERE student_id = $1", [studentId]);

    if (result.rows.length === 0) {
      // throw new Error("Student not found");
      return "Unknown student";
    }

    return result.rows[0].name;
  } catch (error) {
    console.error("Error getting student name by ID:", error);
    throw error;
  }
};


//get Total Questions and Exam type (formally named getExamType)
const getExamQuestionDetails = async (req, res) => {
  const { exam_id } = req.params;

  try {
    const result = await pool.query(
      "SELECT total_questions, template FROM exam WHERE exam_id = $1",
      [exam_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No scores found for this exam" });
    }

    const { total_questions: totalQuestions, template: examType } = result.rows[0];

    return res.status(200).json({
      totalQuestions,
      examType,
    });
  } catch (error) {
    console.error("Error getting exam question details:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// get exam question details by exam id
const getExamQuestionDetailsById = async (exam_id) => {
  try {
    const result = await pool.query(
      "SELECT total_questions, template, mcq_total_marks, parsons_total_marks FROM exam WHERE exam_id = $1",
      [exam_id]
    );

    if (result.rows.length === 0) {
      throw new Error(`No exam found with id ${exam_id}`);
    }

    const { total_questions: totalQuestions, template: examType, mcq_total_marks: mcqTotalMarks, parsons_total_marks: parsonsTotalMarks } = result.rows[0];

    return {
      totalQuestions,
      examType,
      mcqTotalMarks,
      parsonsTotalMarks,
      exam_id
    };
  } catch (error) {
    console.error("Error getting exam question details by ID:", error);
    throw error;
  }
};

// get Template File by exam id
const getExamTemplateFile = async (req, res) => {
  const { examTitle, classID } = req.params;

  try {
    const result = await pool.query(
      "SELECT templateFile FROM exam WHERE exam_title = $1 AND class_id = $2",
      [examTitle, classID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No templateFile found for this exam" });
    }

    const { templateFiles } = result.rows[0];
    // return the json object
    return res.status(200).json({
      templateFiles
    });
  } catch (error) {
    console.error("Error getting exam template file:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


const getScoreByExamId = async (exam_id) => {
  try {
    const result = await pool.query("SELECT total_marks FROM exam WHERE exam_id = $1", [exam_id]);

    if (result.rows.length === 0) {
      return "No scores found for this exam";
    }
    console.log(result.rows.map((row) => row.total_marks));
    return result.rows.map((row) => row.total_marks);
  } catch (error) {
    console.error("Error getting scores by exam ID:", error);
    throw error;
  }
};

const changeGrade = async (req, res, next) => {
  try {
    // Retrieve the current grade
    const currentGradeResult = await pool.query("SELECT grade FROM studentResults WHERE student_id = $1 AND exam_id = $2", [
      req.body.student_id,
      req.body.exam_id,
    ]);

    if (currentGradeResult.rowCount === 0) {
      return res.status(404).json({ message: "Student or exam not found" });
    }

    const currentGrade = currentGradeResult.rows[0].grade;

    // Update the grade and append to changelog
    const result = await pool.query(
      "UPDATE studentResults SET grade = $1, grade_changelog = array_append(grade_changelog, $2) WHERE student_id = $3 AND exam_id = $4",
      [req.body.grade, `Grade was changed from ${currentGrade} to ${req.body.grade}`, req.body.student_id, req.body.exam_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Student or exam not found" });
    }

    res.status(200).json({ message: "Grade updated successfully" });
  } catch (error) {
    console.error("Error changing grade:", error);
    next(error);
  }
};

const fetchStudentScores = async (req, res) =>  {
  try {
    const { exam_id } = req.body;

    if (!exam_id) {
      return res.status(400).json({ error: "Missing exam_id" });
    }

    // TODO[Longsai]: use env variable for OMR service URL
    // Fetch student scores directly from the OMR service
    const response = await fetch(`http://flaskomr:5000/student_scores?examId=${exam_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`OMR service returned status: ${response.status}`);
    }

    const studentScores = await response.json();

    // Fetch image UUIDs for each student from the database
    const resultsWithNamesAndImages = await Promise.all(
      studentScores.map(async (result) => {
        // Filter out empty MCQ answers while keeping Parsons structure intact
        if (result.chosen_answers && result.chosen_answers.mcq) {
          // Filter MCQ answers to remove empty ones
          let filteredMcqFields = Object.keys(result.chosen_answers.mcq)
            .filter((key) => key.startsWith("q") && result.chosen_answers.mcq[key].trim() !== "")
            .map((key) => ({ [key]: result.chosen_answers.mcq[key] }));
          
          // Update the structure with filtered MCQ and keep Parsons as is
          result.chosen_answers = {
            mcq: filteredMcqFields,
            parsons: result.chosen_answers.parsons
          };
        }
        // get student name
        const studentName = await getStudentNameById(result.StudentID);

        // Try to fetch image UUIDs from the database
        try {
          const query = `
            SELECT image_uuids
            FROM studentResults
            WHERE exam_id = $1 AND student_id = $2
          `;

          const dbResult = await pool.query(query, [exam_id, result.StudentID]);

          if (dbResult.rows.length > 0 && dbResult.rows[0].image_uuids) {
            return {
              StudentName: studentName,
              ...result,
              image_uuids: dbResult.rows[0].image_uuids
            };
          }
        } catch (dbError) {
          console.error(`Error fetching image UUIDs for student ${result.StudentID}:`, dbError);
          // Continue without image UUIDs
        }

        // Return result without image UUIDs if not found
        return { StudentName: studentName, ...result };
      })
    );

    res.json(resultsWithNamesAndImages);
  } catch (error) {
    console.error("Error fetching student scores:", error);
    res.status(500).send("Error fetching student scores");
  }
};

const saveResults = async (req, res, next) => {
  const { studentScores, exam_id, examType, numQuestions } = req.body;
  console.log(`Saving results for exam ${exam_id} (${examType}, ${numQuestions} questions)`);

  try {
    // Process each student's data
    for (const student of studentScores) {
      if (!student.StudentID) {
        console.warn("Skipping student with no ID:", student);
        continue;
      }

      const student_id = student.StudentID;
      const grade = student.Score;

      // Handle chosen_answers - could be nested or flat
      let chosen_answers = JSON.stringify(student.chosen_answers);
      console.log("chosen_answers", chosen_answers);
      // Handle image_uuids
      const image_uuids = student.image_uuids || {};

      // Check if there's an existing record
      const checkQuery = "SELECT * FROM studentResults WHERE student_id = $1 AND exam_id = $2";
      const checkResult = await pool.query(checkQuery, [student_id, exam_id]);

      if (checkResult.rows.length > 0) {
        // Update existing record
        const updateQuery = `
          UPDATE studentResults 
          SET grade = $1, chosen_answers = $2, image_uuids = $3
          WHERE student_id = $4 AND exam_id = $5
        `;
        await pool.query(updateQuery, [grade, chosen_answers, image_uuids, student_id, exam_id]);
      } else {
        // Insert new record
        const insertQuery = `
          INSERT INTO studentResults (student_id, exam_id, grade, chosen_answers, image_uuids)
          VALUES ($1, $2, $3, $4, $5)
        `;
        await pool.query(insertQuery, [student_id, exam_id, grade, chosen_answers, image_uuids]);
      }
    }

    // Update the "graded" status in the exams table
    await pool.query("UPDATE exam SET graded = true WHERE exam_id = $1", [exam_id]);

    res.status(200).json({ message: "Results saved successfully" });
  } catch (error) {
    console.error("Error saving student scores:", error);
    res.status(500).json({ error: "Error saving scores" });
  }
};

const ensureDirectoryExistence = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

async function getCustomMarkingSchemes(exam_id) {
  const result = await pool.query("SELECT marking_schemes FROM solution WHERE exam_id = $1", [exam_id]);

    if (result.rows.length === 0) {
      throw new Error(`No marking schemes found for exam_id ${exam_id}`);
    }

  const customMarkingSchemes = result.rows[0].marking_schemes;

  const transformedSchemes = {};
  customMarkingSchemes.forEach((scheme, index) => {
    const schemeName = `SCHEME_${index + 1}`;
    transformedSchemes[schemeName] = {
      questions: scheme.questions,
      marking: {
        correct: scheme.correct,
        incorrect: scheme.incorrect,
        unmarked: scheme.unmarked,
      },
    };
  });
  return transformedSchemes;
}

async function generateCustomBubbleSheet(req, res) {
  const { 
    numQuestions, 
    numOptions, 
    courseId, 
    examTitle, 
    classId,
    includeParsonsProblem = false,
    parsonsPositions = 4
  } = req.body;
  const userId = req.auth?.sub; // Get the user ID of the requester

  if (!numQuestions || !numOptions || !courseId || !examTitle || !classId) {
    return res.status(400).send("Missing required parameters");
  }
  const randomFilePath = `template_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const outputDir = path.join(__dirname, '../assets/custom', randomFilePath);
  let pdfFilePath = '';
  
  // cleanup function - delete the entire output directory
  const cleanupDirectory = () => {
    try {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
        console.log(`Temporary directory deleted: ${outputDir}`);
      }
    } catch (cleanupError) {
      console.error(`Error deleting directory: ${outputDir}`, cleanupError);
    }
  };

  try {
    // create output directory (if it doesn't exist)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Import functions from templateGenerator
    const { calculateQuestionDistribution, generateLatexDocument, generateCustomJsonTemplate } = require('../utils/templateGenerator');
    const { LAYOUT_PARAMS } = require('../utils/templateConstants');

    // Generate random file name
    const latexFilePath = path.join(outputDir, `${randomFilePath}.tex`);
    pdfFilePath = path.join(outputDir, `${randomFilePath}.pdf`);

    // Calculate question distribution
    const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(numQuestions, numOptions, LAYOUT_PARAMS);
    usedCommandTypes.add('placeQuestionAt'); // Ensure placeQuestionAt command is always included

    // Create Parsons configuration if enabled (maxScore will be set later in ManualExamKey)
    const parsonsConfig = includeParsonsProblem ? {
      positions: parsonsPositions
    } : null;

    // Generate LaTeX document
    const latexDocument = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId, parsonsConfig);
    fs.writeFileSync(latexFilePath, latexDocument);

    // Generate JSON template and store in cache
    const jsonTemplate = await generateCustomJsonTemplate(numQuestions, courseId, examTitle, classId, structuredPositions, parsonsConfig);

    // Check if the user already has a resource for this exam, if so, override it
    const templateId = getResourceIdForUser(userId, courseId, examTitle, classId);

    // Compile LaTeX file to generate PDF
    exec(`pdflatex -output-directory=${outputDir} ${latexFilePath}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error compiling LaTeX:', stderr);
        cleanupDirectory();
        return res.status(500).send("Failed to generate PDF");
      }

      // Store in cache with timestamp and other metadata
      templateCache.set(templateId, {
        template: jsonTemplate,
        pdfPath: pdfFilePath,
        timestamp: Date.now(),
        courseId,
        examTitle,
        classId,
        userId
      });

      console.log(`Template and PDF ${templateId} stored in cache`);

      // Set response headers and stream the PDF file
      res.setHeader('Content-Disposition', `attachment; filename="${randomFilePath}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Template-ID', templateId); // Include resource ID in response header
      const pdfStream = fs.createReadStream(pdfFilePath);
      
      // Set stream event handler
      pdfStream.on('error', (streamError) => {
        console.error('Error reading PDF stream:', streamError);
        cleanupDirectory();
      });
      
      // delete the output directory after the file is sent
      pdfStream.on('end', () => {
        // give a little time to ensure the response is fully sent
        setTimeout(cleanupDirectory, 1000);
      });
      
      // pipe output to response
      pdfStream.pipe(res);
    });
  } catch (error) {
    console.error('Error generating bubble sheet:', error);
    cleanupDirectory();
    res.status(500).send("Error generating bubble sheet");
  }
}


// Fetch exam details by exam_id
const getExamDetails = async (req, res, next) => {
  const { exam_id } = req.params;

  try {
    const examQuery = `
      SELECT e.exam_id, e.exam_title, e.total_questions, e.total_marks, e.mean, e.high, e.low, 
      e.upper_quartile, e.lower_quartile, e.page_count, e.viewing_options, graded,
      c.course_id, c.course_name, e.class_id, s.answers
      FROM exam e
      JOIN classes c ON e.class_id = c.class_id
      JOIN solution s ON e.exam_id = s.exam_id 
      WHERE e.exam_id = $1
    `;
    const examResult = await pool.query(examQuery, [exam_id]);

    if (examResult.rows.length === 0) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const ExamDetails = examResult.rows[0];
    
    // Normalize the answers for frontend compatibility
    const normalizedAnswers = normalizeAnswers(ExamDetails.answers);
    ExamDetails.answers = normalizedAnswers.mcq; // Frontend expects MCQ answers as array
    
    const studentResultsQuery = `
    SELECT sr.student_id, s.name as student_name, sr.grade, sr.chosen_answers
    FROM studentResults sr
    JOIN student s ON sr.student_id = s.student_id
    WHERE sr.exam_id = $1
  `;
    const studentResultsResult = await pool.query(studentResultsQuery, [exam_id]);

    // Add correct sequence to Parsons problems for each student
    try {
      const parsonsAnswerKey = await getParsonsAnswerKeyForExam(exam_id);
      let correctSequence = null;
      if (parsonsAnswerKey && parsonsAnswerKey.answerKey) {
        correctSequence = parsonsAnswerKey.answerKey.map(item => parseInt(item.itemNumber)).filter(num => !isNaN(num));
      }
      
      // Add correct sequence to each student's Parsons data
      if (correctSequence) {
        studentResultsResult.rows.forEach(studentResult => {
          if (studentResult.chosen_answers && studentResult.chosen_answers.parsons) {
            studentResult.chosen_answers.parsons.correctSequence = correctSequence;
          }
        });
      }
    } catch (error) {
      console.error("Error adding correct sequence to Parsons data:", error);
      // Continue without correct sequence
    }

    ExamDetails.studentResults = studentResultsResult.rows;

    // Calculate percentage of students who selected each response
    const questionStats = {};
    studentResultsResult.rows.forEach(result => {
      const chosenAnswers = result.chosen_answers;
      
      // Handle new structured format: {mcq: [...], parsons: {...}}
      if (chosenAnswers && chosenAnswers.mcq && Array.isArray(chosenAnswers.mcq)) {
        chosenAnswers.mcq.forEach(answer => {
          const question = Object.keys(answer)[0];
          const response = answer[question];
          
          if (!questionStats[question]) {
            questionStats[question] = {};
          }
          if (!questionStats[question][response]) {
            questionStats[question][response] = 0;
          }
          questionStats[question][response] += 1;
        });
      }
    });

    const totalStudents = studentResultsResult.rows.length;
    for (const question in questionStats) {
      for (const response in questionStats[question]) {
        questionStats[question][response] = (questionStats[question][response] / totalStudents) * 100;
      }
    }

    ExamDetails.questionStats = questionStats;
    res.json(ExamDetails);
    console.log("ExamDetails", ExamDetails);
  } catch (error) {
    console.error("Error fetching exam details:", error);
    res.status(500).json({ message: "Failed to fetch exam details" });
  }
};

const getStudentExams = async (req, res, next) => {
  const studentId = req.auth.sub; // Get the student ID from Auth0 token

  try {
    const exams = await pool.query(
      `
      select exam_id, exam_title, course_id, course_name, graded from exam 
	    join classes using (class_id)
      join enrollment using (class_id)
      join student using (student_id)
      where auth0_id = $1
    `,
      [studentId]
    );

    res.json({ exams: exams.rows });
  } catch (err) {
    console.error("Error fetching student exams:", err);
    next(err);
  }
};

const uploadExam = async (req, res) => {
  const { examType } = req.params;
  const numQ = Number.parseInt(req.params.numQuestions, 10) || 0;

  const upload = multer({ dest: "uploads/" }).single("examPages");

  upload(req, res, async function (err) {
    if (err) {
      return res.status(500).send("Error uploading file.");
    }
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }
    const { path: tempFilePath } = req.file;
    const exam_id = req.body.exam_id; 
    console.log("upload exam req body", req.body);
    // Check if exam has Parsons problems by querying the database
    let includeParsonsProblem = false;
    if (exam_id) {
      try {
        const parsonsResult = await pool.query(
          "SELECT answers FROM solution WHERE exam_id = $1", 
          [exam_id]
        );
        
        if (parsonsResult.rows.length > 0) {
          const rawAnswers = parsonsResult.rows[0].answers;
          const normalizedAnswers = normalizeAnswers(rawAnswers);
          includeParsonsProblem = normalizedAnswers.parsons && normalizedAnswers.parsons.enabled;
        }
      } catch (dbError) {
        console.error("Error checking for Parsons problems:", dbError);
        // Continue with default value (false)
      }
    }

    console.log(`Received file: ${tempFilePath}, exam_id: ${exam_id}, examType: ${examType}, numQ: ${numQ}, includeParsonsProblem: ${includeParsonsProblem}`);
    if (!exam_id) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (unlinkError) {
        console.error("Error deleting temp file:", unlinkError);
      }
      return res.status(400).send("Missing exam_id parameter");
    }

    // Verify file exists before processing
    if (!fs.existsSync(tempFilePath)) {
      return res.status(400).send("Uploaded file not found");
    }

    console.log("File exists:", fs.existsSync(tempFilePath));
    console.log("File stats:", fs.statSync(tempFilePath));

    try {
      const bytes = fs.readFileSync(tempFilePath);
      const formData = new FormData();
      formData.append('pdf_file', new Blob([bytes], { type: 'application/pdf' }), 'upload.pdf');
      formData.append('exam_id', exam_id);
      
      // Set doubleSide parameter based on exam type and Parsons problems
      const doubleSide = examType === "200mcq" || 
                        (examType === "custom" && numQ > 100) || 
                        (examType === "custom" && includeParsonsProblem);
      formData.append('doubleSide', doubleSide.toString());
      formData.append('isCustom', (examType === "custom").toString());

      console.log("Sending request to OMR service...");

      console.log("FormData entries:", formData.get('exam_id'), formData.get('doubleSide'), formData.get('isCustom'));
      
      // Send request to Flask OMR service split_pdf endpoint
      const response = await fetch("http://flaskomr:5000/split_pdf", {
        method: "POST",
        body: formData,
      });

      fs.unlinkSync(tempFilePath);
      console.log("Temporary file cleaned up:", tempFilePath);
      
      console.log("OMR service response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error("OMR service error:", errorData);
        throw new Error(`PDF split failed: ${errorData || 'Unknown error'}`);
      }
      
      const responseData = await response.json();
      res.json({ 
        message: "Exam uploaded successfully", 
        details: responseData 
      });
      
    } catch (error) {
      console.error("Error processing PDF file:", error);
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Temporary file cleaned up after error:", tempFilePath);
        }
      } catch (unlinkError) {
        console.error("Error deleting temporary file:", unlinkError);
      }
      res.status(500).send(`Error processing PDF file: ${error.message}`);
    } 
  });
};


const getGradeChangeLog = async (req, res, next) => {
  const { student_id, exam_id } = req.body;
  console.log(student_id, exam_id);
  try {
    const result = await pool.query("SELECT grade_changelog FROM studentResults WHERE student_id = $1 AND exam_id = $2", [
      student_id,
      exam_id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Student or exam not found" });
    }

    res.json({ grade_changelog: result.rows[0].grade_changelog });
  } catch (error) {
    console.error("Error fetching grade changelog:", error);
    next(error);
  }
};

const getStudentAttempt = async (req, res, next) => {
  const studentId = req.auth.sub; // Get the student ID from Auth0 token
  const examId = parseInt(req.params.exam_id, 10);

  try {
    const exam = await pool.query(
      `
      SELECT exam_id, student_id, grade, chosen_answers, exam_title, total_marks, course_id, course_name, viewing_options 
      from studentResults 
      join student using (student_id) 
	    join exam using (exam_id)
	    join classes using (class_id)
      where auth0_id = $1 and exam_id = $2
    `,
      [studentId, examId]
    );
    
    if (exam.rows.length > 0) {
      const examData = exam.rows[0];
      
      // Check if this exam has Parsons problems and add correct sequence from solution
      if (examData.chosen_answers && examData.chosen_answers.parsons) {
        try {
          const parsonsAnswerKey = await getParsonsAnswerKeyForExam(examId);
          if (parsonsAnswerKey && parsonsAnswerKey.answerKey) {
            // Convert answerKey array to correct sequence format
            const correctSequence = parsonsAnswerKey.answerKey.map(item => parseInt(item.itemNumber)).filter(num => !isNaN(num));
            // Add correct sequence to the student's Parsons data for display
            examData.chosen_answers.parsons.correctSequence = correctSequence;
          }
        } catch (error) {
          console.error("Error fetching Parsons answer key:", error);
          // Continue without correct sequence
        }
      }
      
      res.json({ exam: examData });
    } else {
      res.json({ exam: null });
    }
  } catch (err) {
    console.error("Error fetching student exams:", err);
    next(err);
  }
};

// TODO[Longsai]: , this function is obsolete
const fetchStudentExam = async (req, res, next) => {
  const auth0_id = req.auth.sub; // Get the student ID from Auth0 token
  const exam_id = parseInt(req.params.exam_id, 10);
  const file_name = req.body.page;
  console.log("file_name", file_name);
  try {
    const exams = await pool.query(
      `
      SELECT student_id
      FROM student
      WHERE auth0_id = $1
    `,
      [auth0_id]
    );
    const student_id = exams.rows[0].student_id;
    const folderPath = path.join(__dirname, `../../uploads/Students/exam_id_${exam_id}/student_id_${student_id}/${file_name}`);
    console.log("folderPath", folderPath);
    res.sendFile(folderPath);
  } catch (err) {
    console.error("Error fetching student exams:", err);
    next(err);
  }
};

const fetchSolutionAnswers = async (req, res , next) => {
  const examId = req.params.exam_id;
  try {
    const answersResult = await pool.query("SELECT answers FROM solution WHERE exam_id = $1", [examId]);
    if (answersResult.rows.length === 0) {
      res.status(404).json({ message: "Answers not found" });
      return;
    }

    const rawAnswers = answersResult.rows[0].answers;
    const normalizedAnswers = normalizeAnswers(rawAnswers);
    
    // Return the full normalized structure for frontend use
    res.json(normalizedAnswers.mcq);

  } catch (error) {
    console.error("Error fetching answers:", error);
    res.status(500).json({ message: "Failed to fetch answers" });
  }
}
/*
 return answer array like ["A", "B", "C", "D"] for frontend display
 TODO refactor the frontend code to use the format in the db directly
 */
const fetchSolution = async (req, res, next) => {
  const exam_id = req.params.exam_id;
  try {
    const solutionResult = await pool.query("SELECT answers FROM solution WHERE exam_id = $1", [exam_id]);

    if (solutionResult.rows.length === 0) {
      throw new Error("Solution not found");
    }

    const rawAnswers = solutionResult.rows[0].answers;
    const normalizedAnswers = normalizeAnswers(rawAnswers);
    
    // For backward compatibility, return MCQ answers in the old format
    const mcqAnswersInOrder = normalizedAnswers.mcq.map((answer) => Object.values(answer)[0]);

    res.json(mcqAnswersInOrder);
  } catch (error) {
    console.error("Error fetching solution:", error);
    res.status(500).json({ message: "Failed to fetch solution" });
  }
};

const deleteMyExam = async (req, res, next) => {
  const auth0_id = req.auth.sub; // Retrieve instructor ID from JWT
  const { exam_id } = req.body; // Get exam ID from request body

  try {
    // Verify that the instructor owns the exam
    const examVerificationResult = await pool.query(
      `SELECT e.exam_id 
       FROM exam e
       JOIN classes c ON e.class_id = c.class_id
       WHERE e.exam_id = $1 AND c.instructor_id = $2`,
      [exam_id, auth0_id]
    );

    if (examVerificationResult.rowCount === 0) {
      return res.status(403).json({ message: "Exam not found or you do not have permission to delete this exam." });
    }

    // Start a transaction to ensure atomicity
    await pool.query('BEGIN');

    // Delete from studentResults
    await pool.query("DELETE FROM studentResults WHERE exam_id = $1", [exam_id]);

    // Delete from scannedExam
    await pool.query("DELETE FROM scannedExam WHERE exam_id = $1", [exam_id]);

    // Delete from solutions
    await pool.query("DELETE FROM solution WHERE exam_id = $1", [exam_id]);

    // Delete the exam
    const examDeleteResult = await pool.query(
      "DELETE FROM exam WHERE exam_id = $1 RETURNING *",
      [exam_id]
    );

    if (examDeleteResult.rowCount === 0) {
      throw new Error("Failed to delete the exam.");
    }

    // Commit the transaction
    await pool.query('COMMIT');

    res.json({ message: "Exam and related data deleted successfully" });

  } catch (err) {
    // Rollback transaction in case of error
    await pool.query('ROLLBACK');
    console.error("Error deleting exam:", err);
    next(err);
  }
};

const callOMR = async (req, res, next) => {
  console.log("callOMR");
  try {
    const examId = req.params.examId;
    console.log("Extracted examId from URL:", examId);

    if (!examId) {
      return res.status(400).json({ error: "Missing examId parameter" });
    }

    // get template and evaluation JSON
    console.log("Fetching template and evaluation JSON for exam:", examId);
    let templates, evaluation_json;

    try {
      templates = await getTemplateForExam(examId);
      console.log("Templates fetched successfully");
    } catch (error) {
      console.error("Error fetching templates:", error);
      return res.status(500).json({ error: `Failed to fetch template: ${error.message}` });
    }

    try {
      evaluation_json = await getEvaluationJsonForExam(examId);
      console.log("Evaluation JSON generated successfully");
    } catch (error) {
      console.error("Error generating evaluation JSON:", error);
      return res.status(500).json({ error: `Failed to generate evaluation JSON: ${error.message}` });
    }

    // Get Parsons answer key for potential inclusion
    let parsonsConfig = null;
    try {
      const parsonsAnswerKey = await getParsonsAnswerKeyForExam(examId);
      if (parsonsAnswerKey && parsonsAnswerKey.enabled) {
        // Convert answer key array to correct sequence format
        const correctSequence = parsonsAnswerKey.answerKey.map(item => parseInt(item.itemNumber)).filter(num => !isNaN(num));
        
        // Get exam details to retrieve the actual Parsons total marks
        const examDetails = await getExamQuestionDetailsById(examId);
        const actualParsonsMaxScore = examDetails.parsonsTotalMarks || parsonsAnswerKey.maxScore || 10;
        
        parsonsConfig = {
          enabled: true,
          correct_sequence: correctSequence,
          max_score: actualParsonsMaxScore
        };
        console.log("Parsons config prepared:", JSON.stringify(parsonsConfig));
      }
    } catch (error) {
      console.log("No Parsons configuration found for exam:", examId);
    }

    // create request body
    const requestBody = {
      templates,
      evaluation_json,
      parsons_config: parsonsConfig
    };

    console.log("Sending request to OMR service with templates and evaluation_json");

    // call OMR processing service
    const response = await fetch(`http://flaskomr:5000/process/${examId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody)
    });

    console.log("OMR Response: ", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OMR service returned status ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    res.json({
      message: "OMR processing started successfully",
      details: responseData
    });
  } catch (error) {
    console.error("Error calling OMR: ", error);
    res.status(500).json({ error: error.message });
  }
}

// Helper function to get evaluation JSON for an exam
async function getEvaluationJsonForExam(exam_id) {
  exam_id = parseInt(exam_id, 10);

  if (isNaN(exam_id)) {
    throw new Error("Invalid exam_id");
  }

  try {
    // get exam question details by exam id
    const examDetails = await getExamQuestionDetailsById(exam_id);
    console.log("Exam details:", JSON.stringify(examDetails));
    const { examType, totalQuestions, mcqTotalMarks, parsonsTotalMarks } = examDetails;

    // get answer key and marking schemes
    const answerKey = await getAnswerKeyForExam(exam_id);
    const parsonsAnswerKey = await getParsonsAnswerKeyForExam(exam_id);

    const customMarkingSchemes = await getCustomMarkingSchemes(exam_id);
    console.log("Custom marking schemes:", JSON.stringify(customMarkingSchemes));

    // Calculate marks per question based on MCQ total marks
    const marksPerMcqQuestion = mcqTotalMarks && totalQuestions > 0 ? (mcqTotalMarks / totalQuestions).toString() : "1";
    
    console.log("Evaluation JSON Debug:", {
      examId: exam_id,
      examType,
      totalQuestions,
      mcqTotalMarks,
      parsonsTotalMarks,
      marksPerMcqQuestion,
      answerKeyLength: answerKey ? answerKey.length : 0
    });
    
    const markingSchemes = {
      DEFAULT: {
        correct: marksPerMcqQuestion,
        incorrect: "0",
        unmarked: "0",
      },
    };

    // TODO: spliting custom schemes with more than 100 questions will have same marking scheme for both halves, leading to error in OMR service
    for (const [sectionName, scheme] of Object.entries(customMarkingSchemes)) {
      markingSchemes[sectionName] = {
        questions: scheme.questions,
        marking: scheme.marking,
      };
    }

    let response = {};

    if (examType === "200mcq" || (examType === "custom" && totalQuestions > 100)) {
      const firstHalfQuestions = answerKey.slice(0, 100);
      const secondHalfQuestions = answerKey.slice(100);

      const evaluationJsonPage1 = createEvaluationJson(firstHalfQuestions, markingSchemes, 1);
      const evaluationJsonPage2 = createEvaluationJson(secondHalfQuestions, markingSchemes, 101);

      response = {
        page_1: evaluationJsonPage1,
        page_2: evaluationJsonPage2
      };
    } else if (examType === "100mcq") {
      const evaluationJson = createEvaluationJson(answerKey, markingSchemes, 1);
      response = {
        page_2: evaluationJson
      };
    }
    else if (examType === "custom" && totalQuestions <= 100) {
      const evaluationJson = createEvaluationJson(answerKey, markingSchemes, 1);
      response = {
        page_1: evaluationJson
      };
    } else {
      throw new Error("Invalid exam type.");
    }

    console.log("Generated evaluation JSON structure:", {
      examId: exam_id,
      examType,
      responseKeys: Object.keys(response),
      page1Questions: response.page_1 ? response.page_1.options?.questions_in_order?.length : 0,
      page1Answers: response.page_1 ? response.page_1.options?.answers_in_order?.length : 0,
      page1Schemes: response.page_1 ? Object.keys(response.page_1.marking_schemes || {}) : [],
      page2Questions: response.page_2 ? response.page_2.options?.questions_in_order?.length : 0,
      page2Answers: response.page_2 ? response.page_2.options?.answers_in_order?.length : 0
    });

    return response;
  } catch (error) {
    console.error("Error generating evaluation JSON:", error);
    throw error;
  }
}
// helper function to create evaluation JSON for an exam
function createEvaluationJson(questions, markingSchemes, questionStartIndex) {
  return {
    source_type: "local",
    options: {
      questions_in_order: Array.from({ length: questions.length }, (_, i) => `q${i + questionStartIndex}`),
      answers_in_order: questions,
    },
    outputs_configuration: {
      should_explain_scoring: true,
      draw_question_verdicts: {
        enabled: true,
        verdict_colors: {
          correct: "#00ff00",
          neutral: "#ff0000",
          incorrect: "#ff0000",
        },
        verdict_symbol_colors: {
          positive: "#000000",
          neutral: "#000000",
          negative: "#000000",
        },
        draw_answer_groups: {
          enabled: true,
        },
      },
      draw_detected_bubble_texts: {
        enabled: false,
      },
    },
    marking_schemes: markingSchemes,
  };
}

// Helper function to get template for an exam
async function getTemplateForExam(examId) {
  try {
    if (!examId) {
      throw new Error("Missing exam ID");
    }

    // Query the database to get the template files
    const query = "SELECT template_file FROM exam WHERE exam_id = $1";
    const result = await pool.query(query, [examId]);

    if (result.rows.length === 0) {
      throw new Error("Exam not found");
    }

    const templateFiles = result.rows[0].template_file;

    if (!templateFiles) {
      throw new Error("No template files found for this exam");
    }

    console.log("Template files type:", typeof templateFiles);
    console.log("Template files structure:", JSON.stringify(templateFiles));

    return templateFiles;
  } catch (error) {
    console.error("Error fetching template files:", error);
    throw error;
  }
}

// fetch students by exam id
const getStudentsByExamId = async (req, res, next) => {
  const { examId } = req.params;
  
  try {
    // verify examId is valid
    if (!examId || isNaN(parseInt(examId, 10))) {
      return res.status(400).json({ message: "Invalid exam ID" });
    }
    
    // query database to get student information
    const result = await pool.query(
      `SELECT student.student_id, student.name
       FROM student
       JOIN enrollment ON student.student_id = enrollment.student_id
       JOIN exam ON enrollment.class_id = exam.class_id
       WHERE exam.exam_id = $1
       ORDER BY student.name`,
      [examId]
    );
    
    // return query result
    res.status(200).json({
      students: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error("Error fetching exam students:", error);
    next(error);
  }
};

// export all students' scanned results for one exam as PDFs in zip
/**
 * Exports all students' scanned results for a given exam as a ZIP file containing PDFs.
 * @param {object} req - Express request object, expects examId in req.params.
 * @param {object} res - Express response object, streams ZIP file to client.
 * @returns {Promise<void>} Sends a ZIP file or error response.
 */
const exportExamScannedResults = async (req, res) => {
  const { examId } = req.params;
  
  try {
    if (!examId || isNaN(parseInt(examId, 10))) {
      return res.status(400).json({ message: "Invalid exam ID" });
    }

    const examQuery = `
      SELECT e.exam_id, e.exam_title, c.course_id, c.course_name
      FROM exam e
      JOIN classes c ON e.class_id = c.class_id
      WHERE e.exam_id = $1
    `;
    const examResult = await pool.query(examQuery, [examId]);
    
    if (examResult.rows.length === 0) {
      return res.status(404).json({ message: "Exam not found" });
    }
    
    const examInfo = examResult.rows[0];

    // get students enrolled in the exam
    // fetch students and their image UUIDs for the exam
    const studentsQuery = `
      SELECT s.student_id, s.name, sr.image_uuids
      FROM student s
      JOIN enrollment e ON s.student_id = e.student_id
      JOIN exam ex ON e.class_id = ex.class_id
      LEFT JOIN studentResults sr ON s.student_id = sr.student_id AND ex.exam_id = sr.exam_id
      WHERE ex.exam_id = $1
      ORDER BY s.name
    `;
    const studentsResult = await pool.query(studentsQuery, [examId]);
    
    if (studentsResult.rows.length === 0) {
      return res.status(404).json({ message: "No students found for this exam" });
    }

    // Call the OMR service to generate the export
    const exportRequest = {
      exam_id: examId,
      exam_title: examInfo.exam_title,
      course_id: examInfo.course_id,
      students: studentsResult.rows
    };

    const response = await fetch("http://flaskomr:5000/export_exam_results", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(exportRequest)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Export service failed: ${errorData}`);
    }

    // Stream the ZIP file response back to the client
    const filename = `exam_${examId}_${examInfo.exam_title.replace(/[^a-zA-Z0-9]/g, '_')}_scanned_results.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Get the ZIP file as a buffer and send it to the client
    const zipBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);

  } catch (error) {
    console.error("Error exporting exam scanned results:", error);
    res.status(500).json({ message: "Failed to export exam scanned results" });
  }
};

module.exports = {
  saveQuestions,
  newExam,
  examBoard,
  getAnswerKeyForExam,
  getParsonsAnswerKeyForExam,
  getAveragePerExam,
  getAveragePerCourse,
  getStudentGrades,
  getStudentNameById,
  getScoreByExamId,
  saveResults,
  getExamQuestionDetails,
  getExamTemplateFile,
  ensureDirectoryExistence,
  getCustomMarkingSchemes,
  generateCustomBubbleSheet,
  getExamDetails,
  getStudentExams,
  getStudentAttempt,
  fetchStudentExam,
  fetchSolution,
  fetchSolutionAnswers,
  changeGrade,
  getGradeChangeLog,
  deleteMyExam,
  getExamQuestionDetailsById,
  getStoredResource,
  finalizeResource,
  createEvaluationJson,
  callOMR,
  fetchStudentScores,
  uploadExam,
  getStudentsByExamId,
  exportExamScannedResults
};
