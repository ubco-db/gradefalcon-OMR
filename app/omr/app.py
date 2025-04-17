from flask import Flask, request, jsonify
import subprocess
import os
import shutil
import csv
import json
import uuid
import time
import datetime
import threading
from pdf_to_images import pdf_to_images
from cassandra_client import CassandraClient
import requests

app = Flask(__name__)
cassandra_client = CassandraClient()

# Folder expiration time tracking
EXPIRY_RECORD_FILE = 'folder_expiry_times.json'
DEFAULT_EXPIRY_DAYS = 30
SUCCESS_EXPIRY_HOURS = 2

# Load expiry time records
def load_expiry_records():
    if os.path.exists(EXPIRY_RECORD_FILE):
        try:
            with open(EXPIRY_RECORD_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            app.logger.error(f"Error loading expiry time record file: {e}")
    return {}

# Save expiry time records
def save_expiry_records(records):
    try:
        with open(EXPIRY_RECORD_FILE, 'w') as f:
            json.dump(records, f, indent=2)
    except Exception as e:
        app.logger.error(f"Error saving expiry time record file: {e}")

# Set folder expiry time
def set_folder_expiry(exam_id, hours=None):
    records = load_expiry_records()
    
    # If time not specified, use default 30 days
    if hours is None:
        expiry_time = time.time() + (DEFAULT_EXPIRY_DAYS * 24 * 60 * 60)
    else:
        expiry_time = time.time() + (hours * 60 * 60)
    
    # Update record
    records[exam_id] = {
        'created_at': time.time(),
        'expires_at': expiry_time,
        'expiry_date': datetime.datetime.fromtimestamp(expiry_time).strftime('%Y-%m-%d %H:%M:%S')
    }
    
    save_expiry_records(records)
    app.logger.info(f"Set expiry time for exam_id {exam_id} to {records[exam_id]['expiry_date']}")

# Clean up expired folders
def cleanup_expired_folders():
    records = load_expiry_records()
    current_time = time.time()
    updated = False
    
    # Check and clean up expired folders
    for exam_id, info in list(records.items()):
        if info['expires_at'] < current_time:
            try:
                # Delete input folder
                input_dir = os.path.join("./inputs", exam_id)
                if os.path.exists(input_dir):
                    shutil.rmtree(input_dir)
                    app.logger.info(f"Deleted expired input folder: {input_dir}")
                
                # Delete output folder
                output_dir = os.path.join("./outputs", exam_id)
                if os.path.exists(output_dir):
                    shutil.rmtree(output_dir)
                    app.logger.info(f"Deleted expired output folder: {output_dir}")
                
                # Remove from records
                del records[exam_id]
                updated = True
                
            except Exception as e:
                app.logger.error(f"Error cleaning up expired folder {exam_id}: {e}")
    
    # If updated, save records
    if updated:
        save_expiry_records(records)

# Run cleanup task periodically
def schedule_cleanup():
    cleanup_expired_folders()
    # Run cleanup every hour
    threading.Timer(60 * 60, schedule_cleanup).start()

# Start cleanup task when application starts
@app.before_first_request
def start_cleanup_scheduler():
    schedule_cleanup()

# To run the demo please run "docker cp src/assets/template.json app-backend-1:/code/omr/inputs/template.json". We are currently working to automate the process.

@app.route('/')
def home():
    return "Flask OMR Service is running"

def save_template(input_dir, templates):
    """save template json to input directory"""

    
    try:

        
        # Save page 1 template
        if "page_1" in templates:
            page1_dir = os.path.join(input_dir, "page_1")
            os.makedirs(page1_dir, exist_ok=True)
            
            with open(os.path.join(page1_dir, "template.json"), 'w') as f:
                json.dump(templates["page_1"], f, indent=2)
            app.logger.info(f"Saved page 1 template to {page1_dir}/template.json")
        
        # Save page 2 template if exists
        if "page_2" in templates:
            page2_dir = os.path.join(input_dir, "page_2")
            os.makedirs(page2_dir, exist_ok=True)
            
            with open(os.path.join(page2_dir, "template.json"), 'w') as f:
                json.dump(templates["page_2"], f, indent=2)
            app.logger.info(f"Saved page 2 template to {page2_dir}/template.json")
        
        return True
    
    except Exception as e:
        app.logger.error(f"Error fetching and saving template: {str(e)}")
        return False

def save_evaluation(input_dir, evaluation_json):
    """save evaluation json to input directory"""

    
    try:

        
        # Save page_1 evaluation JSON
        if "page_1" in evaluation_json:
            page1_dir = os.path.join(input_dir, "page_1")
            os.makedirs(page1_dir, exist_ok=True)
            
            with open(os.path.join(page1_dir, "evaluation.json"), 'w') as f:
                json.dump(evaluation_json["page_1"], f, indent=2)
            app.logger.info(f"Saved page_1 evaluation json to {page1_dir}/evaluation.json")
        
        # Save page_2 evaluation JSON if exists
        if "page_2" in evaluation_json:
            page2_dir = os.path.join(input_dir, "page_2")
            os.makedirs(page2_dir, exist_ok=True)
            
            with open(os.path.join(page2_dir, "evaluation.json"), 'w') as f:
                json.dump(evaluation_json["page_2"], f, indent=2)
            app.logger.info(f"Saved page_2 evaluation json to {page2_dir}/evaluation.json")
        
        return True
    
    except Exception as e:
        app.logger.error(f"Error fetching and saving evaluation json: {str(e)}")
        return False

def save_config(input_dir):
    """Save OMR processing configuration to input directory"""
    try:
        config = {
            "outputs": {
                "colored_outputs_enabled": True,
                "filter_out_multimarked_files": False,
                "show_image_level": 5,
                "save_image_level": 5
            }
        }
        
        config_path = os.path.join(input_dir, "config.json")
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        app.logger.info(f"Configuration file saved to {config_path}")
        return True
        
    except Exception as e:
        app.logger.error(f"Error saving configuration file: {str(e)}")
        return False

@app.route('/process/<exam_id>', methods=['POST'])
def process_omr(exam_id):
    print(app.root_path)
    
    # Ensure exam_id is valid
    if not exam_id:
        return jsonify({"error": "Invalid examId parameter"}), 400
    
    # Get template and evaluation data from request body
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required with templates and evaluation_json"}), 400
    
    templates = data.get('templates')
    evaluation_json = data.get('evaluation_json')
    single_choice_only = data.get('single_choice_only', True)  # Default to True if not specified
    
    if not templates:
        return jsonify({"error": "Missing templates in request body"}), 400
    if not evaluation_json:
        return jsonify({"error": "Missing evaluation_json in request body"}), 400
    
    # Create exam-specific input and output subdirectories
    base_input_dir = "./inputs"
    base_output_dir = "./outputs"
    input_dir = os.path.join(base_input_dir, exam_id)
    out_dir = os.path.join(base_output_dir, exam_id)
    
    # Ensure subdirectories exist
    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    
    # Set default 30 days expiry time
    set_folder_expiry(exam_id)
    
    # Fetch and save template files
    if not save_template(input_dir, templates):
        return jsonify({"error": "Failed to fetch template files"}), 500
    
    # Fetch and save evaluation JSON files
    if not save_evaluation(input_dir, evaluation_json):
        return jsonify({"error": "Failed to fetch evaluation JSON files"}), 500
        
    # Save OMR processing configuration
    if not save_config(input_dir):
        return jsonify({"error": "Failed to save config file"}), 500
    
    # Log the current directory structure for debugging
    for root, dirs, files in os.walk("/omr"):
        app.logger.info(f"Root: {root}, Dirs: {dirs}, Files: {files}")

    try:
        # Log contents of input directory before processing
        app.logger.info(f"Contents of input directory before processing: {os.listdir(input_dir)}")
        
        # Run the OMR processing script
        app.logger.info(f"Starting OMR processing for exam_id: {exam_id}")
        result = subprocess.run(
            ["python3", "OMRChecker/main.py", "--inputDir", input_dir, "--outputDir", out_dir],
            capture_output=True,
            text=True,
            check=True
        )
        app.logger.info(f"OMR processing completed for exam_id: {exam_id}")

        # Process results and store images in Cassandra
        app.logger.info(f"Starting to process results and store images for exam_id: {exam_id}")
        process_results_and_store_images(exam_id, single_choice_only)
        app.logger.info(f"Completed processing results and storing images for exam_id: {exam_id}")
        
        # Process success, update expiry time to 2 hours later
        set_folder_expiry(exam_id, SUCCESS_EXPIRY_HOURS)

        return jsonify({"output": result.stdout}), 200
    
    except subprocess.CalledProcessError as e:
        app.logger.error(f"OMR Script CalledProcessError: {e}")
        app.logger.error(f"OMR Script stderr: {e.stderr}")
        return jsonify({"error": str(e), "output": e.stdout, "errors": e.stderr}), 500
    except Exception as e:
        app.logger.error(f"OMR Script Exception: {e}")
        return jsonify({"error": str(e)}), 500

def process_results_and_store_images(exam_id, single_choice_only=True):
    """Process OMR results, store images in Cassandra, and create a combined result with UUIDs"""
    # Use exam_id specific directories
    base_input_dir = "./inputs"
    base_output_dir = "./outputs"
    input_dir = os.path.join(base_input_dir, exam_id)
    out_dir = os.path.join(base_output_dir, exam_id)
    
    page1_dir = os.path.join(out_dir, "page_1")
    page2_dir = os.path.join(out_dir, "page_2")
    
    
    # Check if output directory exists
    if not os.path.exists(page1_dir):
        app.logger.error(f"Result directory does not exist: {page1_dir}")
        return
        
    # Initialize Cassandra client
    if not cassandra_client.connected:
        cassandra_client.connect()
    
    page1_results = []
    page1_results_file = None
    page1_results_dir = os.path.join(page1_dir, "Results")
    # search for all Results_<timestamp>.csv files in page1_dir/Results
    for root, dirs, files in os.walk(page1_results_dir):
        for file in files:
            if file.startswith("Results") and file.endswith(".csv"):
                results_file_path = os.path.join(root, file)
                app.logger.info(f"Found page_1 result file: {results_file_path}")
                page1_results_file = results_file_path
                break
                
        # if a results file is found in the current directory, continue to search for subdirectories
        for dir_name in dirs:
            sub_dir = os.path.join(root, dir_name)
            for sub_root, sub_dirs, sub_files in os.walk(sub_dir):
                for file in sub_files:
                    if file.startswith("Results") and file.endswith(".csv"):
                        results_file_path = os.path.join(sub_root, file)
                        app.logger.info(f"Found page_1 subdirectory result file: {results_file_path}")
                        page1_results_file = results_file_path
                        break
    
    # check if page_1 results file exists
    if not page1_results_file:
        app.logger.error(f"Results file not found in page_1 directory")
        return
    
    # read page_1 data
    with open(page1_results_file, 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        headers_page1 = reader.fieldnames
        
        # process each row
        for row in reader:
            page1_results.append(row)
    

    page2_results = []
    page2_results_file = None
    has_page2 = os.path.exists(page2_dir)
    page2_results_dir = os.path.join(page2_dir, "Results")
    if has_page2:
        # search for all Results_<timestamp>.csv files in page2_dir/Results
        for root, dirs, files in os.walk(page2_results_dir):
            for file in files:
                if file.startswith("Results") and file.endswith(".csv"):
                    results_file_path = os.path.join(root, file)
                    app.logger.info(f"Found page_2 result file: {results_file_path}")
                    page2_results_file = results_file_path
                    break
                    
            # if a results file is found in the current directory, continue to search for subdirectories
            for dir_name in dirs:
                sub_dir = os.path.join(root, dir_name)
                for sub_root, sub_dirs, sub_files in os.walk(sub_dir):
                    for file in sub_files:
                        if file.startswith("Results") and file.endswith(".csv"):
                            results_file_path = os.path.join(sub_root, file)
                            app.logger.info(f"Found page_2 subdirectory result file: {results_file_path}")
                            page2_results_file = results_file_path
                            break
        
        # read page_2 data (if exists)
        if page2_results_file:
            with open(page2_results_file, 'r') as csvfile:
                reader = csv.DictReader(csvfile)
                headers_page2 = reader.fieldnames
                
                # process each row
                for row in reader:
                    page2_results.append(row)
    
    # merge page_1 and page_2 results
    student_results_list = []
    
    # process page_1 results
    for p1_row in page1_results:
        student_id = p1_row.get('StudentID', p1_row.get('file_id', f"unknown_{uuid.uuid4()}"))
        app.logger.info(f"Processing student ID: {student_id}")
        
        # store images to Cassandra
        front_original_path = os.path.join(input_dir, "page_1", p1_row['file_id'])
        front_results_path = os.path.join(page1_dir, "CheckedOMRs/colored", p1_row['file_id'])
        
        front_original_uuid = None
        front_results_uuid = None
        
        try:
            if os.path.exists(front_original_path):
                front_original_uuid = cassandra_client.store_image(front_original_path)
            
            if os.path.exists(front_results_path):
                front_results_uuid = cassandra_client.store_image(front_results_path)
        except Exception as e:
            app.logger.error(f"Error storing page_1 images: {e}")
        
        # create student result
        student_result = {
            "StudentID": student_id,
            "Score": p1_row.get('score', '0'),
            "image_uuids": {
                "page1": {
                    "original": front_original_uuid,
                    "results": front_results_uuid
                }
            },
            "chosen_answers": {}
        }
        
        # Initialize multiple answers tracking if single_choice_only is enabled
        if single_choice_only:
            student_result["has_multiple_answers"] = []
        
        # Add page_1 answers
        for key, value in p1_row.items():
            if key.startswith('q') and value.strip():
                student_result["chosen_answers"][key] = value
                
                # Check for multiple answers if single_choice_only is enabled
                if single_choice_only and len(value.strip()) > 1:
                    student_result["has_multiple_answers"].append(key)
        
        # If page_2 data exists, find matching row
        if has_page2 and page2_results:
            # Find matching page_2 row based on file ID
            matching_p2_row = None
            
            for p2_row in page2_results:
                # Try to match by StudentID
                if 'StudentID' in p2_row and p2_row['StudentID'] == student_id:
                    matching_p2_row = p2_row
                    break
                
                # If no StudentID, try to match by file_id
                if 'file_id' in p2_row and 'file_id' in p1_row and p2_row['file_id'] == p1_row['file_id']:
                    matching_p2_row = p2_row
                    break
            
            if matching_p2_row:
                # store page_2 images
                back_original_path = os.path.join(input_dir, "page_2", matching_p2_row['file_id'])
                back_results_path = os.path.join(page2_dir, "CheckedOMRs/colored", matching_p2_row['file_id'])
                
                back_original_uuid = None
                back_results_uuid = None
                
                try:
                    if os.path.exists(back_original_path):
                        back_original_uuid = cassandra_client.store_image(back_original_path)
                    
                    if os.path.exists(back_results_path):
                        back_results_uuid = cassandra_client.store_image(back_results_path)
                except Exception as e:
                    app.logger.error(f"Error storing page_2 images: {e}")
                
                # Add page_2 image UUIDs
                student_result["image_uuids"]["page2"] = {
                    "original": back_original_uuid,
                    "results": back_results_uuid
                }
                
                # Calculate total score
                try:
                    p1_score = float(student_result["Score"]) if student_result["Score"] else 0
                    p2_score = float(matching_p2_row.get("score", "0")) if matching_p2_row.get("score") else 0
                    
                    total_score = p1_score + p2_score
                    student_result["Score"] = str(int(total_score) if total_score.is_integer() else total_score)
                except (ValueError, TypeError) as e:
                    app.logger.error(f"Error calculating total score: {e}")
                
                # Add page_2 answers
                for key, value in matching_p2_row.items():
                    if key.startswith('q') and value.strip():
                        if key in student_result["chosen_answers"]:
                            # This is a duplicate question on page 2, rename to page2_q*
                            new_key = f"page2_{key}"
                            student_result["chosen_answers"][new_key] = value
                            
                            # Check for multiple answers in page 2 duplicate questions
                            if single_choice_only and len(value.strip()) > 1:
                                student_result["has_multiple_answers"].append(new_key)
                        else:
                            # This is a new question
                            student_result["chosen_answers"][key] = value
                            
                            # Check for multiple answers in page 2 new questions
                            if single_choice_only and len(value.strip()) > 1:
                                student_result["has_multiple_answers"].append(key)
        
        # Clean up has_multiple_answers if empty
        if single_choice_only and not student_result["has_multiple_answers"]:
            del student_result["has_multiple_answers"]
        
        # Add student result to list
        student_results_list.append(student_result)
    
    # Save merged results to file
    student_results_path = os.path.join(out_dir, "student_results.json")
    with open(student_results_path, 'w') as f:
        json.dump(student_results_list, f, indent=2)
    
    app.logger.info(f"Saved {len(student_results_list)} student results to {student_results_path}")
    return student_results_list

@app.route('/student_scores', methods=['GET'])
def get_student_scores():
    # Get exam_id from query parameters
    exam_id = request.args.get('examId')
    if not exam_id:
        return jsonify({"error": "Missing examId parameter"}), 400
    
    # Get single_choice_only parameter, default to True
    single_choice_only = request.args.get('single_choice_only', 'true').lower() == 'true'
    
    # Use exam_id specific output directory
    out_dir = os.path.join("./outputs", exam_id)
    student_results_path = os.path.join(out_dir, "student_results.json")
    
    if not os.path.exists(student_results_path):
        # If the file doesn't exist, call process_results_and_store_images
        process_results_and_store_images(exam_id, single_choice_only)
        
        # Check again after processing
        if not os.path.exists(student_results_path):
            return jsonify({"error": "Student results not found"}), 404
    
    try:
        with open(student_results_path, 'r') as f:
            student_results = json.load(f)
        
        return jsonify(student_results), 200
    except Exception as e:
        app.logger.error(f"Error reading student results: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/split_pdf', methods=['POST'])
def split_pdf():
    try:
        # check if pdf file is uploaded
        if 'pdf_file' not in request.files:
            return jsonify({"error": "No PDF file uploaded"}), 400
            
        pdf_file = request.files['pdf_file']
        if pdf_file.filename == '':
            return jsonify({"error": "No PDF file selected"}), 400
            
        # get exam_id from request parameters
        exam_id = request.form.get('exam_id')
        if not exam_id:
            return jsonify({"error": "Missing exam_id parameter"}), 400
            
        double_side = request.form.get('doubleSide', 'false').lower() == 'true'
        is_custom = request.form.get('isCustom', 'false').lower() == 'true'
        
        # use exam_id specific directory
        base_input_dir = "./inputs"
        input_dir = os.path.join(base_input_dir, exam_id)
        base_output_dir = "./outputs"
        output_dir = os.path.join(base_output_dir, exam_id)
        
        # ensure directory exists
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        # Set default 30 days expiry time
        set_folder_expiry(exam_id)
        
        # save uploaded pdf file
        pdf_path = os.path.join(input_dir, "exam.pdf")
        pdf_file.save(pdf_path)
        app.logger.info(f"PDF file saved to {pdf_path}")
        
        # process pdf file
        try:
            # call pdf_to_images and get return result
            results = pdf_to_images(input_dir, input_dir, double_pages=double_side, is_custom=is_custom)
            
            # check if processing succeeded
            if not results["success"]:
                app.logger.error(f"PDF processing failed: {results['error']}")
                return jsonify({"error": f"PDF processing failed: {results['error']}"}), 500
            
            # check if images were generated
            page_1_dir = os.path.join(input_dir, "page_1")
            has_images = False
            
            if os.path.exists(page_1_dir):
                image_files = [f for f in os.listdir(page_1_dir) if f.endswith('.png')]
                has_images = len(image_files) > 0
            
            if not has_images:
                return jsonify({"error": "PDF processing completed but no images were generated"}), 500
            
            # Process success, update expiry time to 2 hours later
            set_folder_expiry(exam_id, SUCCESS_EXPIRY_HOURS)
            
            response_data = {
                "message": "PDF processed successfully",
                "double_side": double_side,
                "processed_files": results["processed_files"]
            }
            
            return jsonify(response_data), 200
            
        except Exception as e:
            app.logger.error(f"PDF processing error: {e}")
            return jsonify({"error": f"PDF processing failed: {str(e)}"}), 500
        
    except Exception as e:
        app.logger.error(f"PDF processing error: {e}")
        return jsonify({"error": str(e)}), 500
    

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
