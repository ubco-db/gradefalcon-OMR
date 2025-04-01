/**
 * Routes for image operations
 * Supports reading, deleting, and individual fetch images
 * Creation is handled by the OMR service
 */

const express = require('express');
const router = express.Router();
const { getStudentExamImages, deleteImage, getSingleImage } = require('../controllers/imageController');
const { checkJwt } = require('../auth0');

// Apply authentication middleware to all routes
router.use(checkJwt);

// Get all images for a student's exam
router.get('/exam/:examId/student/:studentId', getStudentExamImages);

// Delete a specific image
router.delete('/delete', deleteImage);

// Get a single image by UUID
router.get('/:uuid', getSingleImage);

module.exports = router;