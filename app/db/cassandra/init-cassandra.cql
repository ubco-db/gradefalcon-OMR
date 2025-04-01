-- Create keyspace if it doesn't exist
CREATE KEYSPACE IF NOT EXISTS gradefalcon_images
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

-- Create table for storing images with minimal schema (just UUID and image data)
CREATE TABLE IF NOT EXISTS gradefalcon_images.images (
  id uuid PRIMARY KEY,
  image_data blob
);