import os
import uuid
from cassandra.cluster import Cluster
from cassandra.auth import PlainTextAuthProvider
import logging
import base64

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CassandraClient:
    def __init__(self):
        # Cassandra connection parameters
        self.contact_points = os.environ.get('CASSANDRA_CONTACT_POINTS', 'cassandra').split(',')
        self.port = int(os.environ.get('CASSANDRA_PORT', '9042'))
        self.keyspace = os.environ.get('CASSANDRA_KEYSPACE', 'gradefalcon_images')
        self.datacenter = os.environ.get('CASSANDRA_DATACENTER', 'datacenter1')
        self.username = os.environ.get('CASSANDRA_USERNAME')
        self.password = os.environ.get('CASSANDRA_PASSWORD')
        
        self.cluster = None
        self.session = None
        self.connected = False
    
    def connect(self):
        try:
            # Create authentication provider if credentials are provided
            auth_provider = None
            if self.username and self.password:
                auth_provider = PlainTextAuthProvider(username=self.username, password=self.password)
            
            # Connect to the Cassandra cluster
            self.cluster = Cluster(
                contact_points=self.contact_points,
                port=self.port,
                auth_provider=auth_provider
            )
            
            self.session = self.cluster.connect()
            
            # Create keyspace if it doesn't exist
            self.session.execute(
                f"""
                CREATE KEYSPACE IF NOT EXISTS {self.keyspace}
                WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': 1}}
                """
            )
            
            # Use the keyspace
            self.session.set_keyspace(self.keyspace)
            
            # Create table if it doesn't exist
            self.session.execute(
                """
                CREATE TABLE IF NOT EXISTS images (
                  id uuid PRIMARY KEY,
                  image_data blob
                )
                """
            )
            
            self.connected = True
            logger.info(f"Connected to Cassandra cluster at {self.contact_points}")
            return True
            
        except Exception as e:
            logger.error(f"Error connecting to Cassandra: {str(e)}")
            self.connected = False
            return False
    
    def disconnect(self):
        if self.cluster:
            self.cluster.shutdown()
            self.connected = False
            logger.info("Disconnected from Cassandra cluster")
    
    def store_image(self, image_path):
        """
        Store an image file in Cassandra and return its UUID
        
        Args:
            image_path: Path to the image file
            
        Returns:
            UUID string if successful, None otherwise
        """
        if not self.connected:
            if not self.connect():
                logger.error("Not connected to Cassandra")
                return None
        
        try:
            # Read image file
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            # Generate a UUID for the image
            image_id = uuid.uuid4()
            
            # Insert image into Cassandra
            query = "INSERT INTO images (id, image_data) VALUES (%s, %s)"
            self.session.execute(query, (image_id, image_data))
            
            logger.info(f"Image {image_path} stored in Cassandra with UUID {image_id}")
            return str(image_id)
            
        except Exception as e:
            logger.error(f"Error storing image in Cassandra: {str(e)}")
            return None
    
    def get_image(self, image_uuid):
        """
        Retrieve an image from Cassandra by UUID
        
        Args:
            image_uuid: UUID string of the image to retrieve
            
        Returns:
            Row object with image_data if successful, None otherwise
        """
        if not self.connected:
            if not self.connect():
                logger.error("Not connected to Cassandra")
                return None
        
        try:
            # Convert string UUID to UUID object if needed
            if isinstance(image_uuid, str):
                image_uuid = uuid.UUID(image_uuid)
            
            # Query image from Cassandra
            query = "SELECT image_data FROM images WHERE id = %s"
            result = self.session.execute(query, (image_uuid,))
            row = result.one()
            
            if row:
                logger.info(f"Image {image_uuid} retrieved from Cassandra")
                return row
            else:
                logger.warning(f"Image {image_uuid} not found in Cassandra")
                return None
                
        except Exception as e:
            logger.error(f"Error retrieving image from Cassandra: {str(e)}")
            return None
