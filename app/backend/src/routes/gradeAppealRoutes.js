const { submitGradeAppeal, respondGradeAppeal, fetchStudentResolvedGradeAppeals, fetchStudentUnresolvedGradeAppeals, fetchExamUnresolvedGradeAppeals } = require ('../controllers/gradeAppealController');

const express = require('express');

const router = express.Router();

router.post('/submit', submitGradeAppeal);
router.post('/respond', respondGradeAppeal)
router.get('/resolved/exams/:exam_id/students/:student_id', fetchStudentResolvedGradeAppeals);
router.get('/unresolved/exams/:exam_id/students/:student_id', fetchStudentUnresolvedGradeAppeals);
router.get('/unresolved/exams/:exam_id', fetchExamUnresolvedGradeAppeals);
module.exports = router;