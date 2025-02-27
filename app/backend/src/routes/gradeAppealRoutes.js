const { submitGradeAppeal, respondGradeAppeal, fetchStudentResolvedGradeAppeals, fetchStudentUnresolvedGradeAppeals } = require ('../controllers/gradeAppealController');

const express = require('express');

const router = express.Router();

router.post('/submit', submitGradeAppeal);
router.post('/respond', respondGradeAppeal)
router.post('/resolvedappeals', fetchStudentUnresolvedGradeAppeals);
router.post('/unresolvedappeals', fetchStudentResolvedGradeAppeals);
module.exports = router;