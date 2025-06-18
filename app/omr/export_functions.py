from flask import jsonify, send_file
import json
import tempfile
import shutil
import zipfile
import datetime
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from PIL import Image

def sanitize_filename(filename):
    """Sanitize filename to remove invalid characters"""
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename

def create_pdf_from_images(images, student_name, student_id):
    """Create a PDF from a list of images"""
    if not images:
        # Create an empty PDF with a message
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        c.drawString(100, 750, f"No scanned images available for {student_name} (ID: {student_id})")
        c.save()
        buffer.seek(0)
        return buffer.getvalue()
    
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_width, page_height = A4
    
    for i, (image_name, image_data) in enumerate(images):
        if i > 0:
            c.showPage()  # Start new page for subsequent images
        
        try:
            # Convert image data to PIL Image
            image = Image.open(BytesIO(image_data))
            
            # Calculate scaling to fit page while maintaining aspect ratio
            img_width, img_height = image.size
            scale_x = (page_width - 100) / img_width  # Leave 50pt margin on each side
            scale_y = (page_height - 100) / img_height  # Leave 50pt margin on top/bottom
            scale = min(scale_x, scale_y)
            
            new_width = img_width * scale
            new_height = img_height * scale
            
            # Center the image on the page
            x = (page_width - new_width) / 2
            y = (page_height - new_height) / 2
            
            # Draw the image
            img_reader = ImageReader(BytesIO(image_data))
            c.drawImage(img_reader, x, y, width=new_width, height=new_height)
            
            # Add image name as footer
            c.drawString(50, 30, f"Page {i+1}: {image_name} - {student_name} (ID: {student_id})")
            
        except Exception as e:
            print(f"Error processing image {image_name}: {e}")
            # Draw error message instead
            c.drawString(100, 400, f"Error loading image: {image_name}")
            c.drawString(100, 380, f"Error: {str(e)}")
    
    c.save()
    buffer.seek(0)
    return buffer.getvalue()

def export_exam_results_handler(app, cassandra_client, request):
    """Export all students' scanned results for an exam as PDFs in a ZIP archive"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        exam_id = data.get('exam_id')
        exam_title = data.get('exam_title', f'Exam_{exam_id}')
        course_id = data.get('course_id', 'Unknown_Course')
        students = data.get('students', [])
        
        if not exam_id:
            return jsonify({"error": "Missing exam_id"}), 400
        
        if not students:
            return jsonify({"error": "No students found for this exam"}), 400
        
        # Initialize Cassandra client
        if not cassandra_client.connected:
            cassandra_client.connect()
        
        # Create temporary directory for PDFs
        temp_dir = tempfile.mkdtemp()
        
        try:
            pdf_files = []
            
            for student in students:
                student_id = student.get('student_id')
                student_name = student.get('name') or f'Student_{student_id}'
                image_uuids = student.get('image_uuids') or {}
                
                if not student_id:
                    app.logger.warning(f"Skipping student with no ID: {student}")
                    continue
                
                app.logger.info(f"Processing student: {student_name} (ID: {student_id})")
                
                # Collect all images for this student from Cassandra
                all_images = []
                
                # Get images from Cassandra using UUIDs
                for page, page_images in image_uuids.items():
                    for image_type, uuid in page_images.items():
                        if uuid:
                            try:
                                image_data = cassandra_client.get_image(uuid)
                                if image_data and image_data.image_data:
                                    image_name = f"{page}_{image_type}.png"
                                    all_images.append((image_name, bytes(image_data.image_data)))
                            except Exception as e:
                                app.logger.error(f"Error retrieving image {uuid}: {e}")
                
                # Create PDF from images
                safe_name = sanitize_filename(student_name)
                pdf_filename = f"{safe_name}-{student_id}.pdf"
                pdf_data = create_pdf_from_images(all_images, student_name, student_id)
                
                pdf_path = f"{temp_dir}/{pdf_filename}"
                with open(pdf_path, 'wb') as f:
                    f.write(pdf_data)
                
                pdf_files.append((pdf_filename, pdf_path))
                app.logger.info(f"Created PDF for {student_name}: {len(all_images)} images")
            
            # Create ZIP archive
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                
                # Add all PDF files
                for pdf_filename, pdf_path in pdf_files:
                    zipf.write(pdf_path, pdf_filename)
            
            zip_buffer.seek(0)
            
            # Clean up temporary files
            shutil.rmtree(temp_dir, ignore_errors=True)
            
            # Return the ZIP file
            filename = f"exam_{exam_id}_{sanitize_filename(exam_title)}_scanned_results.zip"
            
            return send_file(
                zip_buffer,
                as_attachment=True,
                download_name=filename,
                mimetype='application/zip'
            )
            
        except Exception as e:
            # Clean up temporary files on error
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise e
            
    except Exception as e:
        app.logger.error(f"Error exporting exam results: {e}")
        return jsonify({"error": f"Failed to export exam results: {str(e)}"}), 500
