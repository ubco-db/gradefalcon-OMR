const express = require("express");
const {
  saveQuestions,
  newExam,
  examBoard,
  getAnswerKeyForExam,
  getAveragePerExam,
  getAveragePerCourse,
  getStudentGrades,
  getStudentNameById,
  getScoreByExamId,
  getExamQuestionDetails,
  saveResults,
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
  uploadExam
} = require("../controllers/examController");
const { createUploadMiddleware } = require("../middleware/uploadMiddleware");
const { checkJwt, checkPermissions } = require("../auth0"); // Importing from auth.js
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Parser } = require("json2csv");
const { PDFDocument } = require("pdf-lib");
const multer = require("multer");
const { formatWithOptions } = require("util");
const e = require("express");
const config = require('../config');
const pool = require('../utils/db');
const FormData = require('form-data');
const fetch = require('node-fetch');

const router = express.Router();
const combinedUpload = multer().fields([
  { name: 'examKey', maxCount: 1 },
  { name: 'numQuestions' },
  { name: 'examTitle' },
  { name: 'classID' },
  { name: 'template' }
]);

router.post("/saveQuestions", checkJwt, checkPermissions(['create:exam']), saveQuestions);
router.post("/NewExam", checkJwt, checkPermissions(['create:exam']), newExam);
router.post("/ExamBoard", checkJwt, checkPermissions(['read:exams']), examBoard);
router.get("/average-per-exam", checkJwt, checkPermissions(['read:examAverageData']), getAveragePerExam);
router.get("/average-per-course", checkJwt, checkPermissions(['read:courseAverageData']), getAveragePerCourse);
router.get('/grades/:studentId', checkJwt, checkPermissions(['read:grades']), getStudentGrades);
router.post("/generateCustomBubbleSheet", checkJwt, checkPermissions(['create:exam']), generateCustomBubbleSheet);  
router.get("/getExamDetails/:exam_id", checkJwt, checkPermissions(['read:exams']), getExamDetails);
router.get("/student/exams", checkJwt, checkPermissions(["read:exam_student"]), getStudentExams);
router.get("/getStudentAttempt/:exam_id", checkJwt, checkPermissions(["read:exam_student"]), getStudentAttempt);
router.get("/getExamQuestionDetails/:exam_id", checkJwt, checkPermissions(["read:exam"]), getExamQuestionDetails);


router.post('/delete-exam', checkJwt, (req, res, next) => {
  checkPermissions(['delete:exams'])(req, res, next);
}, deleteMyExam);
// Function to get the answer key for a specific exam

router.get("/getAnswerKey/:exam_id", async (req, res, next) => {
  try {
    const exam_id = parseInt(req.params.exam_id, 10);
    if (isNaN(exam_id)) {
      throw new Error("Invalid exam_id");
    }
    const answerKey = await getAnswerKeyForExam(exam_id);
    res.json({ answerKey });
  } catch (error) {
    console.error("Error in /getAnswerKey:", error);
    res.status(500).send("Error getting answer key");
  }
});

// Get the exam attempt for a given student
router.get("/getStudentAttempt/:exam_id", async (req, res, next) => {
  try {
    const exam_id = parseInt(req.params.exam_id, 10);
    if (isNaN(exam_id)) {
      throw new Error("Invalid exam_id");
    }
    const studentAttempt = await getStudentAttempt(exam_id);
    res.json({ studentAttempt });
  } catch (error) {
    console.error("Error in /getStudentAttempt:", error);
    res.status(500).send("Error getting student attempt");
  }
});


// Get student scores stored in Flask OMR service for review
router.post("/studentScores", checkJwt, checkPermissions(["read:grades"]), fetchStudentScores);


router.post("/UploadExam/:examType/:numQuestions", checkJwt, checkPermissions(["upload:file"]), async function (req, res) {
  const { examType, numQuestions } = req.params;

  const upload = multer({ dest: "uploads/" }).single("examPages");

  upload(req, res, async function (err) {
    if (err) {
      return res.status(500).send("Error uploading file.");
    }

    const { path: tempFilePath } = req.file;
    const exam_id = req.body.exam_id; 

    if (!exam_id) {
      fs.unlinkSync(tempFilePath); 
      return res.status(400).send("Missing exam_id parameter");
    }

    try {
      // create FormData object, for sending file
      const formData = new FormData();
      formData.append('pdf_file', fs.createReadStream(tempFilePath));
      formData.append('exam_id', exam_id);
      
      // set doubleSide parameter based on exam type
      const doubleSide = examType === "200mcq" || (examType === "custom" && numQuestions > 100) || examType === "100mcq";
      formData.append('doubleSide', doubleSide.toString());

      // send request to Flask OMR service split_pdf endpoint
      const response = await fetch("http://flaskomr:5000/split_pdf", {
        method: "POST",
        body: formData
      });
      
      // delete temporary file
      fs.unlinkSync(tempFilePath);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`PDF split failed: ${errorData.error || 'Unknown error'}`);
      }
      
      const responseData = await response.json();
      res.json({ 
        message: "Exam uploaded successfully", 
        details: responseData 
      });
      
    } catch (error) {
      console.error("Error processing PDF file:", error);
      // ensure temporary file is deleted
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (unlinkError) {
        console.error("Error deleting temporary file:", unlinkError);
      }
      res.status(500).send(`Error processing PDF file: ${error.message}`);
    }
  });
});

router.post("/fetchChangelog", checkJwt, checkPermissions(["read:grades"]), getGradeChangeLog);

// TODO: Legacy route for getting results used by examkey, remove when examkey is removed
router.post("/getResults", checkJwt, checkPermissions(["read:grades"]), async function (req, res) {
  const singlePage = req.body.singlePage;
  const inputDirPath = path.join(__dirname, "../../omr/inputs");
  const outputDirPath = path.join(__dirname, "../../omr/outputs");
  if (singlePage) {
    const results = []; // Array to hold all rows of data
    console.log("singlePage");
    fs.createReadStream(path.join(outputDirPath, "page_1/Results/Results.csv"))
      .pipe(csv())
      .on("data", (data) => results.push(data)) // Push each row of data into the results array
      .on("end", () => {
        // Once file reading is done, send the entire results array as a response
        res.json({ csv_file: results });
      })

      .on("error", (error) => {
        // Handle any errors during file reading
        console.error("Error reading CSV file:", error);
        res.status(500).send("Error reading CSV file");
      });
  } else {
    const resultsPage1 = [];
    const resultsPage2 = [];

    // Read page_1/Results/Results.csv
    fs.createReadStream(path.join(outputDirPath, "page_1/Results/Results.csv"))
      .pipe(csv())
      .on("data", (data) => resultsPage1.push(data))
      .on("end", () => {
        // Read page_2/Results/Results.csv
        fs.createReadStream(path.join(outputDirPath, "page_2/Results/Results.csv"))
          .pipe(csv())
          .on("data", (data) => resultsPage2.push(data))
          .on("end", () => {
            // Combine results from both pages
            const combinedResults = [{ ...resultsPage1[0], ...resultsPage2[0] }];
            // Send the combined results as a response
            res.json({ csv_file: combinedResults });
          })
          .on("error", (error) => {
            console.error("Error reading CSV file from page 2:", error);
            res.status(500).send("Error reading CSV file from page 2");
          });
      })
      .on("error", (error) => {
        console.error("Error reading CSV file from page 1:", error);
        res.status(500).send("Error reading CSV file from page 1");
      });
  }
});

// Save student exams to the database
// Removed saveStudentExams route since it's no longer being used
// All functionality has been consolidated into the saveResults endpoint

// TODO: Legacy route for saving exam key used by examkey, remove when examkey is removed
router.post("/saveExamKey/:examType", checkJwt, checkPermissions(["upload:file"]), async function (req, res) {
  combinedUpload(req, res, async function (err) {
    if (err) {
      return res.status(500).send("Error uploading file.");
    }

    console.log("Request Body:", req.body);  // This should now contain the form fields
    console.log("Uploaded File:", req.files); // This should show the uploaded file

    const examType = req.params.examType;
    const numQuestions = parseInt(req.body.numQuestions, 10); // Ensure numQuestions is a number
    console.log("Exam Type:", examType);

    try {
      if (examType === "100mcq" || (examType === "custom" && numQuestions <= 100)) {
        // Handle 100mcq or custom templates with 100 or fewer questions (1 page)
        const destinationDir = "/code/omr/inputs/page_1";
        
        ensureDirectoryExistence(destinationDir);

        // Directly save the uploaded file to the destination directory
        const fileBuffer = req.files.examKey[0].buffer; // Use the buffer from the uploaded file
        const filePath = path.join(destinationDir, req.files.examKey[0].originalname);

        fs.writeFileSync(filePath, fileBuffer);

        console.log(`File uploaded to ${filePath}`);
        return res.json({ message: "File uploaded successfully" });

      } else if (examType === "200mcq" || (examType === "custom" && numQuestions > 100)) {
        // Handle 200mcq or custom templates with more than 100 questions (2 pages)
        const existingPdfBytes = req.files.examKey[0].buffer; // Use the buffer directly
        const destinationDir1 = "/code/omr/inputs/page_1";
        const destinationDir2 = "/code/omr/inputs/page_2";

        ensureDirectoryExistence(destinationDir1);
        ensureDirectoryExistence(destinationDir2);

        try {
          const keyPDF = await PDFDocument.load(existingPdfBytes);

          const key_page_1 = await PDFDocument.create();
          const key_page_2 = await PDFDocument.create();

          const [page1] = await key_page_1.copyPages(keyPDF, [0]);
          const [page2] = await key_page_2.copyPages(keyPDF, [1]);

          key_page_1.addPage(page1);
          key_page_2.addPage(page2);
          const key_page_1_Bytes = await key_page_1.save();
          fs.writeFileSync(path.join(destinationDir1, "page_1.pdf"), key_page_1_Bytes);
          const key_page_2_Bytes = await key_page_2.save();
          fs.writeFileSync(path.join(destinationDir2, "page_2.pdf"), key_page_2_Bytes);

          return res.json({ message: "200mcq or custom key uploaded and split successfully" });
        } catch (error) {
          console.error("Error processing PDF file:", error);
          return res.status(500).send("Error processing PDF file");
        }
      } else {
        return res.status(400).send("Invalid exam type or number of questions.");
      }
    } catch (error) {
      console.error("Error in saveExamKey:", error);
      return res.status(500).send("Internal server error.");
    }
  });
});



// TODO: Legacy route for copying template JSON file to the shared volume, remove when examkey is removed
router.post("/copyTemplate", checkJwt, checkPermissions(["upload:file"]), async function (req, res) {
  console.log("copyTemplate");
  const { examType, keyOrExam, numQuestions, examTitle, classID, courseId } = req.body;

  const filePath_1 = "/code/omr/inputs/page_1";
  const filePath_2 = "/code/omr/inputs/page_2";
  const singlePageDir = "/code/omr/inputs";

  try {
    let templatePath_1, templatePath_2;

    if (examType === "100mcq" && keyOrExam === "key") {
      templatePath_2 = path.join(__dirname, "../assets/templates/100mcq_page_2.json");
      ensureDirectoryExistence(filePath_1);
      fs.copyFileSync(templatePath_2, path.join(filePath_1, "template.json"));
      console.log("Template.json copied successfully for 100mcq key");
      return res.json({ message: "File copied successfully" });
    }

    if (examType === "200mcq" || (examType === "custom" && numQuestions > 100)) {
      if (examType === "custom") {
        templatePath_1 = path.join(__dirname, `../assets/custom/${courseId}_${examTitle}_${classID}/custom_page_1.json`);
        templatePath_2 = path.join(__dirname, `../assets/custom/${courseId}_${examTitle}_${classID}/custom_page_2.json`);
      } else {
        templatePath_1 = path.join(__dirname, `../assets/templates/${examType}_page_1.json`);
        templatePath_2 = path.join(__dirname, `../assets/templates/${examType}_page_2.json`);
      }

      ensureDirectoryExistence(filePath_1);
      ensureDirectoryExistence(filePath_2);

      fs.copyFileSync(templatePath_1, path.join(filePath_1, "template.json"));
      console.log("First template.json copied successfully");
      fs.copyFileSync(templatePath_2, path.join(filePath_2, "template.json"));
      console.log("Second template.json copied successfully");

      return res.json({ message: "Files copied successfully" });
    }

    if (examType === "custom" && numQuestions <= 100) {
      templatePath_1 = path.join(__dirname, `../assets/custom/${courseId}_${examTitle}_${classID}/custom_page_1.json`);
      ensureDirectoryExistence(filePath_1);
      fs.copyFileSync(templatePath_1, path.join(filePath_1, "template.json"));
      console.log("Custom template.json for page 1 copied successfully");
      return res.json({ message: "File copied successfully" });
    }

    if (examType === "100mcq" && keyOrExam === "exam") {
      templatePath_1 = path.join(__dirname, `../assets/templates/100mcq_page_1.json`);
      templatePath_2 = path.join(__dirname, `../assets/templates/100mcq_page_2.json`);

      ensureDirectoryExistence(filePath_1);
      ensureDirectoryExistence(filePath_2);

      fs.copyFileSync(templatePath_1, path.join(filePath_1, "template.json"));
      console.log("First template.json copied successfully for 100mcq exam");
      fs.copyFileSync(templatePath_2, path.join(filePath_2, "template.json"));
      console.log("Second template.json copied successfully for 100mcq exam");

      return res.json({ message: "Files copied successfully" });
    }

    return res.status(400).json({ error: "Invalid request parameters." });
  } catch (error) {
    console.error("Error copying template.json:", error);
    return res.status(500).json({ error: "Error copying template.json" });
  }
});


// GenerateEvaluation removed, use getEvaluationJsonForExam instead

// Call the OMR processing service
router.post("/callOMR/:examId", checkJwt, checkPermissions(["upload:file"]), callOMR);

// Images are now handled by the imageController
// The /api/images/exam/:examId/student/:studentId endpoint should be used instead

router.get("/getScoreByExamId/:exam_id", checkJwt, checkPermissions(["read:grades"]), async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id, 10);
    if (isNaN(exam_id)) {
      return res.status(400).send("Invalid exam_id");
    }
    const scores = await getScoreByExamId(exam_id);
    if (scores.length === 0) {
      return res.status(404).send("No scores found for this exam");
    }
    res.json({ scores });
  } catch (error) {
    console.error("Error in /getScoreByExamId:", error);
    res.status(500).send("Error retrieving scores");
  }
});

router.get("/getExamQuestionDetails/:exam_id", checkJwt, checkPermissions(["read:exam"]), async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id, 10);
    if (isNaN(exam_id)) {
      return res.status(400).send("Invalid exam_id");
    }

    const examDetails = await getExamQuestionDetails(exam_id);
    if (!examDetails || !examDetails.totalQuestions || !examDetails.examType) {
      return res.status(404).send("No exam details found for this exam");
    }

    res.json({ examDetails });
  } catch (error) {
    console.error("Error in /getExamQuestionDetails:", error);
    res.status(500).send("Error retrieving exam details");
  }
});

// BUG lack permission checking
router.post("/saveResults", saveResults);

// router.get("/searchExam/:student_id", checkJwt, checkPermissions(["read:students"]), async (req, res) => {
//   const studentId = req.params.student_id;
//   const filePath = path.join(__dirname, "../../omr/outputs/Results/Results.csv");
//   let found = false; // Flag to check if student is found

//   fs.createReadStream(filePath)
//     .pipe(csv())
//     .on("data", (data) => {
//       if (data.StudentID === studentId) {
//         found = true;
//         res.json({ file_id: data.file_id });
//       }
//     })
//     .on("end", () => {
//       if (!found) {
//         res.status(404).send("Student ID not found");
//       }
//     })
//     .on("error", (error) => {
//       console.error("Error reading CSV file:", error);
//       res.status(500).send("Error reading CSV file");
//     });
// });

// There are 2 folders in outputs: page_1 and page_2
// The first folder contains the ID page and the second folder contains the question page
// Each ID page has a matching question page
// e.g front_pages_page_1.png = back_pages_page_1.png
// We extract the ID from front_pages_page_1.png and the answers from back_pages_page_1.png
// Create a CSV file with the following fields:
// "front_page_id", "back_page_id", "score", "student_id", "question_1", "question_2", ..., "question_100"

// This endpoint is no longer needed as the OMR service now handles merging results and storing images
// The new /student_scores endpoint in the OMR service directly returns the processed data with UUIDs

router.post("/fetchStudentExam/:exam_id", checkJwt, checkPermissions(["read:exam_student"]), fetchStudentExam);

router.post("/fetchSolution/:exam_id", checkJwt, checkPermissions(["read:exam_student"]), fetchSolution);
router.post('/fetchSolutionAnswers/:exam_id', checkJwt, checkPermissions(["read:exam_student"]), fetchSolutionAnswers);

router.post("/changeGrade", checkJwt, checkPermissions(["update:grades"]), changeGrade);


//test routes
router.post("/test", checkJwt, checkPermissions(["upload:file"]), async function (req, res) {
  console.log("test called");
  res.send(JSON.stringify("Test route called successfully"));
});

// Get stored resources (PDFs and templates)
router.get("/resource/:resourceId", checkJwt, getStoredResource);

// Finalize resources (associate staged resources with exam ID and permanently save)
router.post("/finalizeResource", checkJwt, checkPermissions(['create:exam']), finalizeResource);

module.exports = router;
