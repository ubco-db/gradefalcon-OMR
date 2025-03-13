const pool = require("../utils/db");
const fs = require("fs");
const path = require("path");
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Template cache: in-memory storage for templates
const templateCache = new Map();

// Set expiration time (2 hours in milliseconds)
const TEMPLATE_EXPIRATION = 2 * 60 * 60 * 1000;

// Clean up expired templates every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, templateData] of templateCache.entries()) {
    if (now - templateData.timestamp > TEMPLATE_EXPIRATION) {
      templateCache.delete(id);
      console.log(`Template ${id} expired and removed from cache`);
    }
  }
}, 15 * 60 * 1000);

const saveQuestions = async (req, res, next) => {
  const { questions, classID, examTitle, numQuestions, totalMarks, markingSchemes, template, canViewExam, canViewAnswers, templateId } = req.body;

  console.log("Received data:", {
    questions: questions ? "Provided" : "Not provided",
    classID,
    examTitle,
    numQuestions,
    totalMarks,
    markingSchemes: markingSchemes ? "Provided" : "Not provided",
    template: template ? "Provided" : "Not provided",
    canViewExam,
    canViewAnswers,
    templateId
  });

  // Determine template source - from cache or provided in request
  var templateFile;
  
  if (templateId && templateCache.has(templateId)) {
    // Get template from cache
    templateFile = JSON.stringify(templateCache.get(templateId).template);
    console.log(`Retrieved template ${templateId} from cache`);
    
    // Remove from cache after retrieval
    templateCache.delete(templateId);
    console.log(`Deleted template ${templateId} from cache after retrieval`);
  } else if (templateId) {
    console.log(`Template ID ${templateId} provided but not found in cache`);
  }

  try {
    // Create options object
    const options = JSON.stringify({ canViewExam: canViewExam, canViewAnswers: canViewAnswers });
    
    // Insert into exam table
    const writeToExam = await pool.query(
      "INSERT INTO exam (class_id, exam_title, total_questions, total_marks, template, template_file,viewing_options) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING exam_id",
      [classID, examTitle, numQuestions, totalMarks, template, templateFile, options]
    );
    
    const insertedRowId = writeToExam.rows[0].exam_id;

    const writeToSolution = await pool.query("INSERT INTO solution (exam_id, answers, marking_schemes) VALUES ($1, $2, $3)", [
      insertedRowId,
      JSON.stringify(questionsArray),
      JSON.stringify(markingSchemes),
    ]);

    res.status(201).json({ examId: insertedRowId });
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

    const answersArray = solutionResult.rows[0].answers; // This should be a JSON array

    // Extract the answers in order
    const answersInOrder = answersArray.map((answer) => Object.values(answer)[0]);

    return answersInOrder;
  } catch (error) {
    console.error("Error getting answer key for exam:", error);
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
      "SELECT total_questions, template FROM exam WHERE exam_id = $1",
      [exam_id]
    );

    if (result.rows.length === 0) {
      throw new Error(`No exam found with id ${exam_id}`);
    }

    const { total_questions: totalQuestions, template: examType } = result.rows[0];

    return {
      totalQuestions,
      examType,
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
      let chosen_answers = student.chosen_answers;
      
      // If chosen_answers is not present, extract q* fields
      if (!chosen_answers) {
        chosen_answers = {};
        Object.keys(student).forEach(key => {
          if (key.startsWith('q') && student[key] && student[key].trim() !== '') {
            chosen_answers[key] = student[key];
          }
        });
      }
      
      // Handle image_uuids
      const image_uuids = student.image_uuids || {};
      
      // Check if there's an existing record
      const checkQuery = "SELECT * FROM studentResults WHERE student_id = $1 AND exam_id = $2";
      const checkResult = await pool.query(checkQuery, [student_id, exam_id]);
      
      if (checkResult.rows.length > 0) {
        // Update existing record
        const updateQuery = `
          UPDATE studentResults 
          SET grade = $1, chosen_answers = $2, image_uuids = $3, updated_at = NOW()
          WHERE student_id = $4 AND exam_id = $5
        `;
        await pool.query(updateQuery, [grade, chosen_answers, image_uuids, student_id, exam_id]);
      } else {
        // Insert new record
        const insertQuery = `
          INSERT INTO studentResults (student_id, exam_id, grade, chosen_answers, image_uuids, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
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
  const { numQuestions, numOptions, courseId, examTitle, classId } = req.body;

  if (!numQuestions || !numOptions || !courseId || !examTitle || !classId) {
    return res.status(400).send("Missing required parameters");
  }

  try {
    // 创建输出目录（如果不存在）
    const outputDir = path.join(__dirname, '../assets/custom', `${courseId}`);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 导入templateGenerator中的函数
    const { calculateQuestionDistribution, generateLatexDocument, generateCustomJsonTemplate } = require('../utils/templateGenerator');
    const { LAYOUT_PARAMS } = require('../utils/templateConstants');
    
    // 生成随机文件名
    const randomFileName = `template_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const latexFilePath = path.join(outputDir, `${randomFileName}.tex`);
    const pdfFilePath = path.join(outputDir, `${randomFileName}.pdf`);

    // 计算题目分布
    const { usedCommandTypes, structuredPositions } = calculateQuestionDistribution(numQuestions, numOptions, LAYOUT_PARAMS);
    usedCommandTypes.add('placeQuestionAt'); // 确保始终包含placeQuestionAt命令
    
    // 生成LaTeX文档
    const latexDocument = await generateLatexDocument(structuredPositions, usedCommandTypes, courseId, examTitle, classId);
    fs.writeFileSync(latexFilePath, latexDocument);

    // 生成JSON模板并存储在缓存中
    const jsonTemplate = await generateCustomJsonTemplate(numQuestions, courseId, examTitle, classId, structuredPositions);
    const templateId = uuidv4();
    
    // 存储在缓存中并添加时间戳
    templateCache.set(templateId, {
      template: jsonTemplate,
      timestamp: Date.now()
    });
    
    console.log(`Template ${templateId} stored in cache`);

    // 编译LaTeX文件生成PDF
    exec(`pdflatex -output-directory=${outputDir} ${latexFilePath}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error compiling LaTeX:', stderr);
        return res.status(500).send("Failed to generate PDF.");
      }

      // 设置响应头并流式传输PDF文件
      res.setHeader('Content-Disposition', `attachment; filename="${randomFileName}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Template-ID', templateId); // 在响应头中包含模板ID
      const pdfStream = fs.createReadStream(pdfFilePath);
      pdfStream.pipe(res);

      // 在PDF发送后清理辅助文件
      pdfStream.on('close', () => {
        // 清理生成的辅助文件
        const auxFilePath = path.join(outputDir, `${randomFileName}.aux`);
        const logFilePath = path.join(outputDir, `${randomFileName}.log`);

        fs.unlink(auxFilePath, (err) => {
          if (err) console.error(`Error deleting ${auxFilePath}:`, err);
        });
        fs.unlink(logFilePath, (err) => {
          if (err) console.error(`Error deleting ${logFilePath}:`, err);
        });
      });
    });
  } catch (error) {
    console.error('Error generating bubble sheet:', error);
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
    
    const studentResultsQuery = `
    SELECT sr.student_id, s.name as student_name, sr.grade, sr.chosen_answers
    FROM studentResults sr
    JOIN student s ON sr.student_id = s.student_id
    WHERE sr.exam_id = $1
  `;
    const studentResultsResult = await pool.query(studentResultsQuery, [exam_id]);

    ExamDetails.studentResults = studentResultsResult.rows;

    // Calculate percentage of students who selected each response
    const questionStats = {};
    studentResultsResult.rows.forEach(result => {
      const chosenAnswers = result.chosen_answers;
      chosenAnswers.forEach(answer => {
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
    });

    const totalStudents = studentResultsResult.rows.length;
    for (const question in questionStats) {
      for (const response in questionStats[question]) {
        questionStats[question][response] = (questionStats[question][response] / totalStudents) * 100;
      }
    }

    ExamDetails.questionStats = questionStats;
    res.json(ExamDetails);
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
    res.json({ exam: exam.rows[0] });
  } catch (err) {
    console.error("Error fetching student exams:", err);
    next(err);
  }
};

//
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

/*
 return answer array like ["A", "B", "C", "D"]
 */
const fetchSolution = async (req, res, next) => {
  const exam_id = req.params.exam_id;
  try {
    const solutionResult = await pool.query("SELECT answers FROM solution WHERE exam_id = $1", [exam_id]);

    if (solutionResult.rows.length === 0) {
      throw new Error("Solution not found");
    }

    const answersArray = solutionResult.rows[0].answers; // This should be a JSON array

    // Extract the answers in order
    const answersInOrder = answersArray.map((answer) => Object.values(answer)[0]);

    res.json(answersInOrder);
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

module.exports = {
  saveQuestions,
  newExam,
  examBoard,
  getAnswerKeyForExam,
  getAveragePerExam,
  getAveragePerCourse,
  getStudentGrades,
  getAnswerKeyForExam,
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
  changeGrade,
  getGradeChangeLog,
  deleteMyExam,
  getExamQuestionDetailsById,
};
