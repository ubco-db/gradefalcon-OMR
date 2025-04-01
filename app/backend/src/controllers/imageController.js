/**
 * Controller for handling image operations
 * Supports retrieval, deletion, and individual image fetch operations
 */

const cassandraClient = require('../utils/cassandraClient');
const { Pool } = require('pg');
const config = require('../config');

// PostgreSQL connection
const pool = new Pool({
  user: config.database.user,
  host: config.database.host,
  database: config.database.database,
  password: config.database.password,
  port: config.database.port,
});

/**
 * Get a single image by UUID
 * This is an internal utility function not directly exposed via API
 */
const fetchImageByUuid = async (uuid) => {
  if (!uuid) {
    return null;
  }
  
  try {
    await cassandraClient.connect();
    const image = await cassandraClient.getImage(uuid);
    
    if (!image) {
      return null;
    }
    
    return image.image_data;
  } catch (error) {
    console.error('Error getting image:', error);
    throw error;
  }
  // Removed disconnect to prevent "Connecting after shutdown" errors
};

/**
 * Get all images for a student exam
 * Retrieves all UUIDs from PostgreSQL and then fetches the actual images from Cassandra
 * Returns a JSON structure that matches the image_uuids structure but with base64 encoded images
 */
const getStudentExamImages = async (req, res) => {
  const { examId, studentId } = req.params;
  
  if (!examId || !studentId) {
    return res.status(400).json({ message: 'Exam ID and Student ID are required' });
  }
  
  try {
    // Get image UUIDs from PostgreSQL
    const query = `
      SELECT image_uuids
      FROM studentResults
      WHERE exam_id = $1 AND student_id = $2
    `;
    
    const result = await pool.query(query, [examId, studentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Student exam record not found' });
    }
    
    const imageUuids = result.rows[0].image_uuids || {};
    const imageData = {};
    
    // Fetch images from Cassandra and structure them like the UUIDs
    for (const page in imageUuids) {
      imageData[page] = {};
      
      for (const type in imageUuids[page]) {
        const uuid = imageUuids[page][type];
        if (uuid) {
          try {
            const image = await fetchImageByUuid(uuid);
            if (image) {
              // Convert Buffer to base64 string
              imageData[page][type] = Buffer.from(image).toString('base64');
            }
          } catch (error) {
            console.error(`Error fetching image ${uuid}:`, error);
            // Continue with other images even if one fails
          }
        }
      }
    }
    
    res.status(200).json({ images: imageData });
  } catch (error) {
    console.error('Error getting student exam images:', error);
    res.status(500).json({ message: 'Failed to retrieve student exam images' });
  }
};

/**
 * Delete a specific image
 * Removes the UUID from PostgreSQL and deletes the image from Cassandra
 */
const deleteImage = async (req, res) => {
  const { examId, studentId, page, type } = req.body;
  
  if (!examId || !studentId || !page || !type) {
    return res.status(400).json({ 
      message: 'Exam ID, Student ID, page number, and image type are required' 
    });
  }
  
  try {
    // Begin transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current image_uuids
      const selectQuery = `
        SELECT image_uuids
        FROM studentResults
        WHERE exam_id = $1 AND student_id = $2
      `;
      
      const result = await client.query(selectQuery, [examId, studentId]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Student exam record not found' });
      }
      
      const imageUuids = result.rows[0].image_uuids || {};
      
      // Check if the requested image exists
      if (!imageUuids[page] || !imageUuids[page][type]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Image not found' });
      }
      
      const uuid = imageUuids[page][type];
      
      // Delete from Cassandra
      await cassandraClient.connect();
      await cassandraClient.deleteImage(uuid);
      
      // Update PostgreSQL record
      delete imageUuids[page][type];
      
      // Remove page entry if empty
      if (Object.keys(imageUuids[page]).length === 0) {
        delete imageUuids[page];
      }
      
      const updateQuery = `
        UPDATE studentResults
        SET image_uuids = $1
        WHERE exam_id = $2 AND student_id = $3
      `;
      
      await client.query(updateQuery, [JSON.stringify(imageUuids), examId, studentId]);
      
      await client.query('COMMIT');
      
      res.status(200).json({ message: 'Image deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ message: 'Failed to delete image' });
  }
  // Removed disconnect to prevent "Connecting after shutdown" errors
};

/**
 * Get a single image by UUID
 * This endpoint is exposed via API for direct image fetching
 */
const getSingleImage = async (req, res) => {
  const { uuid } = req.params;
  
  if (!uuid) {
    return res.status(400).json({ message: 'Image UUID is required' });
  }
  
  try {
    const imageData = await fetchImageByUuid(uuid);
    
    if (!imageData) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    // Convert Buffer to base64 string
    const base64Image = Buffer.from(imageData).toString('base64');
    
    res.status(200).json({ image: base64Image });
  } catch (error) {
    console.error('Error getting image:', error);
    res.status(500).json({ message: 'Failed to retrieve image' });
  }
};

module.exports = {
  getStudentExamImages,
  deleteImage,
  getSingleImage
};