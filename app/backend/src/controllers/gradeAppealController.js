const pool = require("../utils/db");

const {getCustomMarkingScheme} = require('/examController');
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
        )
        res.status(200).json({message: "Grade appeal submitted successfully"});

    } catch (error) {
        console.error("Error submitting grade appeal:", error);
        next(error);
    }
}

const updateExamGradesBasedOnUpdates = async (exam_id, student_id) => {
    try {
        const customMarkingSchemes = await getCustomMarkingScheme(exam_id);

        // TODO refactor getCustomMarkingSchemes to return a default marking scheme after refactoring of the examRoute is complete
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

        const chosenAnswersResult = await pool.query(`SELECT chosen_answers
                                                      FROM studentresults
                                                      WHERE exam_id = $1
                                                        AND student_id = $2`, [exam_id, student_id]);

        if (chosenAnswersResult.rows.length === 0) {
            throw new Error("No chosen answers found for the given exam_id and student_id", exam_id, student_id);
        }
        const chosenAnswers = chosenAnswersResult.rows[0].chosen_answers;
        const newGrade = calculateTotalGrade(chosenAnswers, markingSchemes);


    } catch (error) {
        console.error("Error updating exam grades based on appeals:", error);
        next(error);
    }
};

const calculateTotalGrade = (chosenAnswers, markingSchemes) => {
    return chosenAnswers.reduce((total, answer) => {
        const question = Object.keys(answer)[0];
        const chosenAnswer = answer[question];

        const markingScheme = Object.values(markingSchemes).find(scheme =>
            scheme.questions && scheme.questions.includes(question)
        )?.marking || markingSchemes.DEFAULT;

        // TODO: need to refactor the solution to compute the grade
        if (chosenAnswer === "correct") {
            return total + parseFloat(markingScheme.correct);
        } else if (chosenAnswer === "incorrect") {
            return total + parseFloat(markingScheme.incorrect);
        } else {
            return total + parseFloat(markingScheme.unmarked);
        }
    }, 0);
};