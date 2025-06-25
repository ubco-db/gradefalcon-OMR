const {
  storeClassLmsIntegration,
  getClassLmsIntegration,
  removeClassLmsIntegration,
  validateClassLmsIntegration,
  getLmsCourses,
  getLmsAssignments,
  createLmsAssignment,
  storeExamLmsAssignment,
  getExamLmsAssignment,
  removeExamLmsAssignment,
  exportGradesToLms,
  exportSubmissionsToLms
} = require('../controllers/lmsController');

const express = require('express');

const router = express.Router();

// Class LMS integration routes
router.post('/class/:classId/integration', storeClassLmsIntegration);
router.get('/class/:classId/integration', getClassLmsIntegration);
router.delete('/class/:classId/integration', removeClassLmsIntegration);
router.post('/class/:classId/validate', validateClassLmsIntegration);

// LMS data fetching routes
router.get('/class/:classId/courses', getLmsCourses);
router.get('/class/:classId/assignments', getLmsAssignments);
router.post('/class/:classId/assignments', createLmsAssignment);

// Exam assignment integration routes
router.post('/exam/:examId/assignment', storeExamLmsAssignment);
router.get('/exam/:examId/assignment', getExamLmsAssignment);
router.delete('/exam/:examId/assignment', removeExamLmsAssignment);

// Export routes
router.post('/exam/:examId/export-grades', exportGradesToLms);
router.post('/exam/:examId/export-submissions', exportSubmissionsToLms);

module.exports = router;