const LMSIntegrationService = require('../integrations/LMSIntegrationService');

/**
 * Store LMS integration for a class
 */
const storeClassLmsIntegration = async (req, res) => {
  try {
    const { classId } = req.params;
    const { lmsType, accessToken, lmsCourseId } = req.body;

    if (!lmsType || !lmsCourseId) {
      return res.status(400).json({ 
        error: 'Missing required fields: lmsType, lmsCourseId' 
      });
    }

    // Check if access token is the asterisks placeholder (updating existing integration)
    const isAsterisksPlaceholder = accessToken === '********************';
    
    if (!accessToken && !isAsterisksPlaceholder) {
      return res.status(400).json({ 
        error: 'Missing required field: accessToken' 
      });
    }

    let finalAccessToken = accessToken;
    
    // If asterisks placeholder, get existing token for validation
    if (isAsterisksPlaceholder) {
      const existingIntegration = await LMSIntegrationService.getClassLmsIntegration(parseInt(classId));
      if (!existingIntegration) {
        return res.status(400).json({ 
          error: 'Cannot update integration: no existing integration found' 
        });
      }
      finalAccessToken = existingIntegration.accessToken;
    }

    // Validate the integration credentials
    const tempService = new (require('../integrations/LMSIntegrationService').constructor)();
    const adapter = tempService.createAdapter(lmsType, finalAccessToken);
    const validation = await adapter.validateCredentials();
    
    if (!validation.valid) {
      return res.status(400).json({ 
        error: `Invalid LMS credentials: ${validation.error}` 
      });
    }

    const integrationId = await LMSIntegrationService.storeClassLmsIntegration(
      parseInt(classId),
      lmsType,
      isAsterisksPlaceholder ? null : accessToken, // null means don't update token
      lmsCourseId
    );

    res.json({ 
      success: true, 
      integrationId,
      message: 'LMS integration configured successfully' 
    });
  } catch (error) {
    console.error('Error storing LMS integration:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get LMS integration for a class
 */
const getClassLmsIntegration = async (req, res) => {
  try {
    const { classId } = req.params;
    const integration = await LMSIntegrationService.getClassLmsIntegration(parseInt(classId));
    
    if (!integration) {
      return res.status(404).json({ error: 'No LMS integration found for this class' });
    }

    // Don't return the access token for security
    const { accessToken, ...safeIntegration } = integration;
    res.json(safeIntegration);
  } catch (error) {
    console.error('Error getting LMS integration:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove LMS integration for a class
 */
const removeClassLmsIntegration = async (req, res) => {
  try {
    const { classId } = req.params;
    const removed = await LMSIntegrationService.removeClassLmsIntegration(parseInt(classId));
    
    if (!removed) {
      return res.status(404).json({ error: 'No LMS integration found for this class' });
    }

    res.json({ success: true, message: 'LMS integration removed successfully' });
  } catch (error) {
    console.error('Error removing LMS integration:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Validate LMS integration for a class
 */
const validateClassLmsIntegration = async (req, res) => {
  try {
    const { classId } = req.params;
    const validation = await LMSIntegrationService.validateClassLmsIntegration(parseInt(classId));
    res.json(validation);
  } catch (error) {
    console.error('Error validating LMS integration:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available courses from LMS
 */
const getLmsCourses = async (req, res) => {
  try {
    const { classId } = req.params;
    const integration = await LMSIntegrationService.getClassLmsIntegration(parseInt(classId));
    
    if (!integration) {
      return res.status(404).json({ error: 'No LMS integration found for this class' });
    }

    const adapter = LMSIntegrationService.createAdapter(integration.lmsType, integration.accessToken);
    const courses = await adapter.getCourses();
    
    res.json(courses);
  } catch (error) {
    console.error('Error fetching LMS courses:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available assignments from LMS course
 */
const getLmsAssignments = async (req, res) => {
  try {
    const { classId } = req.params;
    const integration = await LMSIntegrationService.getClassLmsIntegration(parseInt(classId));
    
    if (!integration) {
      return res.status(404).json({ error: 'No LMS integration found for this class' });
    }

    const adapter = LMSIntegrationService.createAdapter(integration.lmsType, integration.accessToken);
    const assignments = await adapter.getAssignments(integration.lmsCourseId);
    
    res.json(assignments);
  } catch (error) {
    console.error('Error fetching LMS assignments:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Link exam to LMS assignment
 */
const storeExamLmsAssignment = async (req, res) => {
  try {
    const { examId } = req.params;
    const { lmsAssignmentId } = req.body;

    if (!lmsAssignmentId) {
      return res.status(400).json({ error: 'Missing required field: lmsAssignmentId' });
    }

    const integrationId = await LMSIntegrationService.storeExamLmsAssignment(
      parseInt(examId),
      lmsAssignmentId
    );

    res.json({ 
      success: true, 
      integrationId,
      message: 'Exam linked to LMS assignment successfully' 
    });
  } catch (error) {
    console.error('Error linking exam to assignment:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get LMS assignment for exam
 */
const getExamLmsAssignment = async (req, res) => {
  try {
    const { examId } = req.params;
    const assignment = await LMSIntegrationService.getExamLmsAssignment(parseInt(examId));
    
    if (!assignment) {
      return res.status(404).json({ error: 'No LMS assignment found for this exam' });
    }

    res.json(assignment);
  } catch (error) {
    console.error('Error getting exam assignment:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export exam grades to LMS
 */
const exportGradesToLms = async (req, res) => {
  try {
    const { examId } = req.params;
    
    // Get the assignment ID for this exam
    const examAssignment = await LMSIntegrationService.getExamLmsAssignment(parseInt(examId));
    if (!examAssignment) {
      return res.status(400).json({ error: 'No LMS assignment configured for this exam' });
    }

    const result = await LMSIntegrationService.exportGradesToLMS(
      parseInt(examId),
      examAssignment.lmsAssignmentId
    );

    res.json({
      success: true,
      message: 'Grades exported successfully',
      ...result
    });
  } catch (error) {
    console.error('Error exporting grades:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export exam submissions to LMS
 */
const exportSubmissionsToLms = async (req, res) => {
  try {
    const { examId } = req.params;
    
    // Get the assignment ID for this exam
    const examAssignment = await LMSIntegrationService.getExamLmsAssignment(parseInt(examId));
    if (!examAssignment) {
      return res.status(400).json({ error: 'No LMS assignment configured for this exam' });
    }

    const result = await LMSIntegrationService.exportSubmissionsToLMS(
      parseInt(examId),
      examAssignment.lmsAssignmentId
    );

    res.json({
      success: true,
      message: 'Submissions exported successfully',
      ...result
    });
  } catch (error) {
    console.error('Error exporting submissions:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Remove LMS assignment link for exam
 */
const removeExamLmsAssignment = async (req, res) => {
  try {
    const { examId } = req.params;
    const removed = await LMSIntegrationService.removeExamLmsAssignment(parseInt(examId));
    
    if (!removed) {
      return res.status(404).json({ error: 'No LMS assignment found for this exam' });
    }

    res.json({ success: true, message: 'Exam assignment link removed successfully' });
  } catch (error) {
    console.error('Error removing exam assignment link:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create new LMS assignment
 */
const createLmsAssignment = async (req, res) => {
  try {
    const { classId } = req.params;
    const { name, points_possible, due_at, description } = req.body;

    if (!name || points_possible === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, points_possible' 
      });
    }

    // Convert due_at to ISO 8601 format if provided
    let formattedDueAt = null;
    if (due_at && due_at.trim() !== '') {
      try {
        // If it's already a valid ISO string, use it; otherwise convert local datetime to ISO
        const date = new Date(due_at);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date format');
        }
        formattedDueAt = date.toISOString();
      } catch (dateError) {
        return res.status(400).json({ 
          error: 'Invalid due date format. Please provide a valid date.' 
        });
      }
    }

    const assignmentData = {
      name,
      points_possible: parseFloat(points_possible),
      due_at: formattedDueAt,
      description: description || '',
      submission_types: ['online_upload'],
      published: true
    };

    const result = await LMSIntegrationService.createAssignment(parseInt(classId), assignmentData);

    res.json({ 
      success: true, 
      data: result,
      message: 'Assignment created successfully' 
    });
  } catch (error) {
    console.error('Error creating LMS assignment:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
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
};