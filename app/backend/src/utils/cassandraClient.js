/**
 * Cassandra client utility for GradeFalcon
 * This client only supports querying and deleting images
 * Insertion is handled by the OMR service
 */

const { Client } = require('cassandra-driver');
require('dotenv').config();

// Initialize Cassandra client
const client = new Client({
  contactPoints: [process.env.CASSANDRA_CONTACT_POINTS || 'cassandra'],
  localDataCenter: process.env.CASSANDRA_DATACENTER || 'datacenter1',
  keyspace: process.env.CASSANDRA_KEYSPACE || 'gradefalcon_images',
  protocolOptions: {
    port: parseInt(process.env.CASSANDRA_PORT || '9042')
  }
});

// Connect to Cassandra
const connect = async () => {
  try {
    await client.connect();
    console.log('Connected to Cassandra');
    return true;
  } catch (error) {
    console.error('Failed to connect to Cassandra:', error);
    return false;
  }
};

// Get image by UUID
const getImage = async (uuid) => {
  try {
    const query = 'SELECT id, image_data FROM images WHERE id = ?';
    const result = await client.execute(query, [uuid], { prepare: true });
    
    if (result.rowLength === 0) {
      return null;
    }
    
    return result.first();
  } catch (error) {
    console.error('Error retrieving image from Cassandra:', error);
    throw error;
  }
};

// Delete image by UUID
const deleteImage = async (uuid) => {
  try {
    const query = 'DELETE FROM images WHERE id = ?';
    await client.execute(query, [uuid], { prepare: true });
    console.log(`Image ${uuid} deleted from Cassandra`);
    return true;
  } catch (error) {
    console.error('Error deleting image from Cassandra:', error);
    throw error;
  }
};

// Close Cassandra connection
const disconnect = async () => {
  try {
    await client.shutdown();
    console.log('Disconnected from Cassandra');
    return true;
  } catch (error) {
    console.error('Error disconnecting from Cassandra:', error);
    return false;
  }
};

module.exports = {
  connect,
  getImage,
  deleteImage,
  disconnect
};