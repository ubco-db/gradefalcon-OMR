const pool = require("../utils/db");

const {getCustomMarkingSchemes, fetchSolution} = require("./examController");
/**
 * student submit a grade appeal for a specific exam and student
 * @param req
 * @param res
 * @param next
 * @returns {Promise<*>}
 */
const submitGradeAppeal = async (req, res, next) => {
  try {
    const {exam_id, student_id, appeal_details} = req.body;
    if (!exam_id || !student_id || !appeal_details) {
      return res.status(400).json({message: "Missing required fields"});
    }

    if (appeal_details.length === 0) {
      return res.status(400).json({message: "No appeal details provided"});
    }

    // Validate appeal_details format,
    // array like [{"q1": "A"}, {"q2": "B"}]
    if (
        !Array.isArray(appeal_details) ||
        !appeal_details.every(item => {
          const keys = Object.keys(item);
          return (
              keys.length === 1 &&                         // Must have exactly one key
              /^q\d+$/.test(keys[0]) &&                   // Key must follow "q<number>" format
              typeof Object.values(item)[0] === "string"  // Value must be a string
          );
        })
    ) {
      return res.status(400).json({
        message: "Invalid appeal_details format. It must be an array of objects, each containing exactly one key following the format 'q<number>' and a string value."
      });
    }

    const result = await pool.query(
        "INSERT INTO grade_appeals (exam_id, student_id, appeal_details) VALUES ($1, $2, $3) RETURNING grade_appeal_id",
        [exam_id, student_id, JSON.stringify(appeal_details)]
    )
    res.status(200).json({message: "Grade appeal submitted successfully"});

  } catch (error) {
    console.error("Error submitting grade appeal:", error);
    next(error);
  }
}

// instructor make response to grade appeal
const respondGradeAppeal = async (req, res, next) => {
  try {
    const {grade_appeal_id: gradeAppealId, reply_details: replyDetails} = req.body;
    if (!gradeAppealId || !replyDetails) {
      return res.status(400).json({message: "Missing required fields"});
    }

    const studentResult = await pool.query(
        `SELECT student_id, exam_id
         FROM grade_appeals
         WHERE grade_appeal_id = $1`,
        [gradeAppealId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({message: "Grade appeal not found for the given exam"});
    }

    const {exam_id: examId, student_id: studentId} = appealResult.rows[0];

    const chosenAnswersResult = await pool.query(`SELECT chosen_answers
                                                  FROM studentresults
                                                  WHERE student_id = $1
                                                    AND exam_id = $2`,
        [studentId, examId]);


    if (chosenAnswersResult.rows.length === 0) {
      return res.status(404).json({message: "No chosen answers found for the given student and exam"});
    }
    const chosenAnswers = chosenAnswersResult.rows[0].chosen_answers;


    // new chosen answers computed after appeal response
    const resChosenAnswers = getNewChosenAnswers(chosenAnswers, replyDetails);


    const customMarkingSchemes = await getCustomMarkingSchemes(examId);
    // marking scheme for calculating new grade
    const markingSchemes = constructMarkingScheme(customMarkingSchemes);

    const solutionAnswersResult = await fetchAnswer(examId);
    // compute the new grade
    const newGrade = getNewGrade(chosenAnswers, markingSchemes, solutionAnswersResult);

    // update the new grade and chosen answers
    await updateNewGradeAndChosenAnswers(examId, studentId, newGrade, resChosenAnswers);
    await updateGradeAppeal(gradeAppealId, replyDetails);
    res.status(200).json({message: "Grade appeal response confirmed successfully"});


  } catch (error) {
    console.error("Error updating exam grades based on appeals:", error);
    next(error);
  }
};

const fetchStudentResolvedGradeAppeals = async (req, res, next) => {
  try {
    const {exam_id: examId, student_id: studentId} = req.params;

    const result = await pool.query(
        `SELECT grade_appeal_id, exam_id, appeal_details, reply_details, reply_time
         FROM grade_appeals
         WHERE student_id = $1
           AND exam_id = $2
           AND reply_details IS NOT NULL`,
        [studentId, examId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({message: "No resolved grade appeals found"});
    }
    res.status(200).json({
      message: "Grade appeal fetched successfully",
      data: result.rows
    });
  } catch (error) {
    console.error("Error fetching resolved grade appeals:", error);
    next(error);
  }
}

const fetchStudentUnresolvedGradeAppeals = async (req, res, next) => {
  try {
    const {student_id: studentId, exam_id: examId} = req.params;
    const result = await pool.query(
        `SELECT grade_appeal_id, exam_id, appeal_details
         FROM grade_appeals
         WHERE student_id = $1
           AND exam_id = $2
           AND reply_details IS NULL`,
        [studentId, examId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({message: "No resolved grade appeals found"});
    }
    res.status(200).json({
      message: `Unresolved grade appeals from student ${studentId} retrieved successfully`,
      data: result.rows
    });
  } catch (error) {
    console.error("Error fetching unresolved grade appeals:", error);
    next(error);
  }
}

/*
 * Instructor fetch unresolved grade appeals for a specific exam
 */
const fetchExamUnresolvedGradeAppeals = async (req, res, next) => {
  try {
    const {exam_id: examId} = req.params;
    if (!examId) {
      return res.status(400).json({message: "Missing required fields"});
    }

    const unresolvedAppeals = await pool.query(
        `SELECT grade_appeal_id, student_id, appeal_details, appeal_time
         FROM grade_appeals
         WHERE exam_id = $1
           AND (reply_details IS NULL OR reply_details = '[]')`,
        [examId]
    );

    if (unresolvedAppeals.rows.length === 0) {
      return res.status(404).json({message: "No unresolved grade appeals found for this exam"});
    }

    res.status(200).json({
      message: "Unresolved grade appeals retrieved successfully",
      data: unresolvedAppeals.rows
    });


  } catch (error) {
    console.error("Error fetching unresolved grade appeals:", error);
    next(error);
  }
}


/*
      "marking_schemes": {
        "DEFAULT": {
          "correct": "1",
          "incorrect": "0",
          "unmarked": "0"
        },
        "SCHEME_1": {
          "questions": [
            "q1",
            "q2",
            "q3"
          ],
          "marking": {
            "correct": 3,
            "incorrect": 0,
            "unmarked": 0
          }
        }
}
    */

const constructMarkingScheme = (originalMarkingScheme) => {


  // TODO refactor getCustomMarkingSchemes to return a default marking scheme after refactoring of the examRoute.js is complete
  // currently use this to avoid git conflicts
  const markingSchemes = {
    DEFAULT: {
      correct: "1",
      incorrect: "0",
      unmarked: "0",
    },
  };

  for (const [sectionName, scheme] of Object.entries(customMarkingSchemes)) {
    markingSchemes[sectionName] = {
      questions: scheme.questions,
      marking: scheme.marking,
    };
  }
  return markingSchemes;
}
const getNewChosenAnswers = (chosenAnswers, replyDetails) => {
  try {
    // from [{q1:A}, {q2:B}] to {q1:A, q2:B}
    const answerMap = chosenAnswers.reduce((acc, answer) => {
      const key = Object.keys(answer)[0];
      acc[key] = answer[key];
      return acc;
    }, {});
    replyDetails.forEach(reply => {
      const key = Object.keys(reply)[0];
      answerMap[key] = reply[key];
    });
    // from {q1:A, q2:B} to [{q1:A}, {q2:B}]
    return Object.keys(answerMap).map(key => ({[key]: answerMap[key]}));
  } catch (error) {
    console.error("Error constructing new chosen answers:", error);
  }
}


/**
 * Calculate new grade based on the chosen answers, marking schemes, and solution answers
 * @param chosenAnswers
 * @param markingSchemes
 * @param solutionAnswers
 * @returns {number}
 */
const getNewGrade = (chosenAnswers, markingSchemes, solutionAnswers) => {
  try {
    let totalGrade = 0;

    // default marking scheme as fallback
    const defaultMarkingScheme = markingSchemes.DEFAULT;

    // specific marking schemes
    const specificMarkingSchemes = Object.keys(markingSchemes).filter(key => key !== "DEFAULT");
    // from {[q1:A], [q2:B]} to {q1:A, q2:B}
    const chosenAnswersMap = chosenAnswers.reduce((acc, answer) => {
      const key = Object.keys(answer)[0];
      acc[key] = answer[key];
      return acc;
    }, {});
    const solutionAnswersMap = solutionAnswers.reduce((acc, answer) => {
      const key = Object.keys(answer)[0];
      acc[key] = answer[key];
      return acc;
    }, {});

    for (const question in solutionAnswersMap) {
      const correctAnswer = solutionAnswersMap[question];
      const studentAnswer = chosenAnswersMap[question] || null;

      let questionMarkingScheme = defaultMarkingScheme;
      for (const scheme of specificMarkingSchemes) {
        if (markingSchemes[scheme].questions.includes(question)) {
          questionMarkingScheme = markingSchemes[scheme].marking;
          break;
        }
      }
      const correct = parseInt(questionMarkingScheme.correct);
      const incorrect = parseInt(questionMarkingScheme.incorrect);
      const unmarked = parseInt(questionMarkingScheme.unmarked);
      if (studentAnswer === correctAnswer) {
        totalGrade += correct;
      } else if (studentAnswer === null || studentAnswer === "") {
        totalGrade += unmarked;
      } else {
        totalGrade -= incorrect;
      }
    }
    return totalGrade;


  } catch (error) {
    console.error("Error calculating new grade:", error);
  }

}

const fetchAnswer = async (examId) => {
  try {
    const result = await pool.query("SELECT answers FROM solution WHERE exam_id = $1", [examId]);

    if (result.rows.length === 0) {
      throw new Error("answer of solution not found: ", examId);
    }
    return result.rows[0].answers;
  } catch (error) {
    console.error("Error fetching answers from solution:", error);
  }
}

// update grade, chosen_answers, grade_changelog in studentresults table
const updateNewGradeAndChosenAnswers = async (exam_id, student_id, newGrade, chosenAnswers) => {
  // studentresults table
  try {
    const result = await pool.query(
        `UPDATE studentresults
         SET grade           = $1,
             chosen_answers  = $2,
             grade_changelog = array_append(grade_changelog, $3)
         WHERE exam_id = $4
           AND student_id = $5`,
        [newGrade,
          chosenAnswers,
          `Grade updated to ${newGrade} based on grade appeal response`,
          exam_id,
          student_id]
    )
  } catch (error) {
    console.error("Error updating student results:", error);
  }
}

// update reply_details,  reply_time in grade_appeals table
const updateGradeAppeal = async (grade_appeal_id, reply_details) => {
  try {
    const replyTime = new Date();
    const result = await pool.query(
        `UPDATE grade_appeals
         SET reply_details = $1,
             reply_time    = $2
         WHERE grade_appeal_id = $3`,
        [reply_details, replyTime, grade_appeal_id]
    )
  } catch (error) {
    console.error("Error updating grade appeal:", error);
    next(error);
  }
}

module.exports = {
  submitGradeAppeal,
  respondGradeAppeal,
  fetchStudentResolvedGradeAppeals,
  fetchStudentUnresolvedGradeAppeals,
  fetchExamUnresolvedGradeAppeals
};
