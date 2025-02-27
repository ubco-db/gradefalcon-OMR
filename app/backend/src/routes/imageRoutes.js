/**
 * Routes for image operations
 * Only supports reading and deleting images
 * Creation is handled by the OMR service
 */

const express = require('express');
const router = express.Router();
const { getStudentExamImages, deleteImage } = require('../controllers/imageController');
const { jwtCheck } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(jwtCheck);

// Get all images for a student's exam
router.get('/exam/:examId/student/:studentId', getStudentExamImages);

// Delete a specific image
router.delete('/delete', deleteImage);

module.exports = router;