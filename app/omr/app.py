from flask import Flask, request, jsonify
import subprocess
import os
import shutil
import csv
import json
import uuid
from pdf_to_images import pdf_to_images
from cassandra_client import CassandraClient
import requests

app = Flask(__name__)
cassandra_client = CassandraClient()

# To run the demo please run "docker cp src/assets/template.json app-backend-1:/code/omr/inputs/template.json". We are currently working to automate the process.

@app.route('/')
def home():
    return "Flask OMR Service is running"

def fetch_and_save_template(exam_id, input_dir):
    """Fetch template JSON files from backend API and save them to input directory"""
    app.logger.info(f"Fetching template for exam_id: {exam_id}")
    
    try:
        # Fetch template from backend API
        response = requests.get(f"http://backend:3001/api/exam/getTemplate/{exam_id}")
        
        if response.status_code != 200:
            app.logger.error(f"Failed to fetch template. Status code: {response.status_code}")
            app.logger.error(f"Response: {response.text}")
            return False
        
        templates = response.json()
        
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

def fetch_and_save_evaluation(exam_id, input_dir):
    """get evaluation json and save to input directory"""
    app.logger.info(f"get evaluation json: {exam_id}")
    
    try:
        # 从后端API获取评估JSON
        response = requests.get(f"http://backend:3001/api/exam/getEvaluationJson/{exam_id}")
        
        if response.status_code != 200:
            app.logger.error(f"Failed to fetch evaluation JSON. Status code: {response.status_code}")
            app.logger.error(f"Response: {response.text}")
            return False
        
        evaluation_json = response.json()
        
        # 保存page_1评估JSON
        if "page_1" in evaluation_json:
            page1_dir = os.path.join(input_dir, "page_1")
            os.makedirs(page1_dir, exist_ok=True)
            
            with open(os.path.join(page1_dir, "evaluation.json"), 'w') as f:
                json.dump(evaluation_json["page_1"], f, indent=2)
            app.logger.info(f"save page_1 evaluation json to {page1_dir}/evaluation.json")
        
        # 如果存在，保存page_2评估JSON
        if "page_2" in evaluation_json:
            page2_dir = os.path.join(input_dir, "page_2")
            os.makedirs(page2_dir, exist_ok=True)
            
            with open(os.path.join(page2_dir, "evaluation.json"), 'w') as f:
                json.dump(evaluation_json["page_2"], f, indent=2)
            app.logger.info(f"save page_2 evaluation json to {page2_dir}/evaluation.json")
        
        return True
    
    except Exception as e:
        app.logger.error(f"get and save evaluation json error: {str(e)}")
        return False

@app.route('/process/<exam_id>', methods=['POST'])
def process_omr(exam_id):
    print(app.root_path)
    
    # Ensure exam_id is valid
    if not exam_id:
        return jsonify({"error": "Invalid examId parameter"}), 400
    
    # Create exam-specific input and output subdirectories
    base_input_dir = "./inputs"
    base_output_dir = "./outputs"
    input_dir = os.path.join(base_input_dir, exam_id)
    out_dir = os.path.join(base_output_dir, exam_id)
    
    # Ensure subdirectories exist
    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    
    # Fetch and save template files
    if not fetch_and_save_template(exam_id, input_dir):
        return jsonify({"error": "Failed to fetch template files"}), 500
    
    # Fetch and save evaluation JSON files
    if not fetch_and_save_evaluation(exam_id, input_dir):
        return jsonify({"error": "Failed to fetch evaluation JSON files"}), 500
    
    # Log the current directory structure for debugging
    for root, dirs, files in os.walk("/omr"):
        app.logger.info(f"Root: {root}, Dirs: {dirs}, Files: {files}")

    try:
        # Log contents of input directory before processing
        app.logger.info(f"Contents of input directory before processing: {os.listdir(input_dir)}")
        
        # Run the OMR processing script
        app.logger.info(f"Starting OMR processing for exam_id: {exam_id}")
        result = subprocess.run(
            ["python3", "main.py", "--inputDir", input_dir, "--outputDir", out_dir],
            capture_output=True,
            text=True,
            check=True
        )
        app.logger.info(f"OMR processing completed for exam_id: {exam_id}")

        # Process results and store images in Cassandra
        app.logger.info(f"Starting to process results and store images for exam_id: {exam_id}")
        process_results_and_store_images(exam_id)
        app.logger.info(f"Completed processing results and storing images for exam_id: {exam_id}")

        return jsonify({"output": result.stdout}), 200
    
    except subprocess.CalledProcessError as e:
        app.logger.error(f"OMR Script CalledProcessError: {e}")
        app.logger.error(f"OMR Script stderr: {e.stderr}")
        return jsonify({"error": str(e), "output": e.stdout, "errors": e.stderr}), 500
    except Exception as e:
        app.logger.error(f"OMR Script Exception: {e}")
        return jsonify({"error": str(e)}), 500

def process_results_and_store_images(exam_id):
    """Process OMR results, store images in Cassandra, and create a combined result with UUIDs"""
    # Use exam_id specific directories
    base_input_dir = "./inputs"
    base_output_dir = "./outputs"
    input_dir = os.path.join(base_input_dir, exam_id)
    out_dir = os.path.join(base_output_dir, exam_id)
    
    page1_results_path = os.path.join(out_dir, "page_1/Results/Results.csv")
    page2_results_path = os.path.join(out_dir, "page_2/Results/Results.csv")
    
    # Check if page 1 results exist
    if not os.path.exists(page1_results_path):
        app.logger.error(f"Results file not found at {page1_results_path}")
        return
    
    # Initialize the Cassandra client if not connected
    if not cassandra_client.connected:
        cassandra_client.connect()
    
    # Dictionary to store student data by row index
    students_data = {}
    
    # First, read page 1 data
    with open(page1_results_path, 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        headers_page1 = reader.fieldnames
        
        # Process each row (each student)
        for row_idx, row in enumerate(reader):
            # Get student ID
            student_id = row.get('StudentID', row.get('file_id', f"unknown_{uuid.uuid4()}"))
            app.logger.info(f"Processing student ID: {student_id}, Row index: {row_idx}")
            
            # Store front page images in Cassandra
            front_original_path = os.path.join(input_dir, "page_1", row['file_id'])
            front_results_path = os.path.join(out_dir, "page_1/CheckedOMRs/colored", row['file_id'])
            
            front_original_uuid = cassandra_client.store_image(front_original_path)
            front_results_uuid = cassandra_client.store_image(front_results_path)
            
            # Create student result entry
            student_result = {
                "StudentID": student_id,
                "Score": row['score'],
                "image_uuids": {
                    "page1": {
                        "original": front_original_uuid,
                        "results": front_results_uuid
                    }
                },
                "chosen_answers": {}  # Initialize chosen_answers object
            }
            
            # Add question fields from page 1 to chosen_answers
            for key, value in row.items():
                if key.startswith('q') and value.strip():
                    student_result["chosen_answers"][key] = value
            
            # Store by row index for proper merging
            students_data[row_idx] = student_result
    
    # Check if page 2 results exist
    has_page2 = os.path.exists(page2_results_path)
    
    # Process page 2 if exists
    if has_page2:
        app.logger.info("Processing page 2 results")
        with open(page2_results_path, 'r') as csvfile:
            reader = csv.DictReader(csvfile)
            headers_page2 = reader.fieldnames
            
            # Process each row (each student)
            for row_idx, row in enumerate(reader):
                # Only process if we have this student from page 1
                if row_idx in students_data:
                    student_result = students_data[row_idx]
                    
                    # Store back page images in Cassandra
                    back_original_path = os.path.join(input_dir, "page_2", row['file_id'])
                    back_results_path = os.path.join(out_dir, "page_2/CheckedOMRs/colored", row['file_id'])
                    
                    back_original_uuid = cassandra_client.store_image(back_original_path)
                    back_results_uuid = cassandra_client.store_image(back_results_path)
                    
                    # Add page 2 image UUIDs
                    student_result["image_uuids"]["page2"] = {
                        "original": back_original_uuid,
                        "results": back_results_uuid
                    }
                    
                    # Add score from page 2 to the total score
                    try:
                        p1_score = float(student_result["Score"])
                    except (ValueError, TypeError):
                        p1_score = 0
                    
                    try:
                        p2_score = float(row["score"])
                    except (ValueError, TypeError):
                        p2_score = 0
                    
                    total_score = p1_score + p2_score
                    # Format as integer if it's a whole number, otherwise keep decimal
                    student_result["Score"] = str(int(total_score) if total_score.is_integer() else total_score)
                    
                    # Add question fields from page 2 to chosen_answers
                    for key, value in row.items():
                        if key.startswith('q') and value.strip():
                            # Check if question number already exists from page 1
                            # If page 2 has same question numbers, rename them to avoid collision
                            if key in student_result["chosen_answers"] and key.startswith('q'):
                                # Identify if this is a duplicate question from page 2
                                if headers_page1 and key in headers_page1:
                                    # This is a page 2 question that has the same name as a page 1 question
                                    new_key = f"page2_{key}"
                                    student_result["chosen_answers"][new_key] = value
                                else:
                                    # Not a duplicate, just add it
                                    student_result["chosen_answers"][key] = value
                            else:
                                # Not in chosen_answers yet, add it
                                student_result["chosen_answers"][key] = value
                else:
                    app.logger.warning(f"Row index {row_idx} found in page 2 but not in page 1, skipping.")
    
    # Convert dictionary to list for storage
    student_results_list = list(students_data.values())
    
    # Save combined results to file
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
    
    # Use exam_id specific output directory
    out_dir = os.path.join("./outputs", exam_id)
    student_results_path = os.path.join(out_dir, "student_results.json")
    
    if not os.path.exists(student_results_path):
        # If the file doesn't exist, call process_results_and_store_images
        process_results_and_store_images(exam_id)
        
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
        
        # use exam_id specific directory
        base_input_dir = "./inputs"
        input_dir = os.path.join(base_input_dir, exam_id)
        base_output_dir = "./outputs"
        output_dir = os.path.join(base_output_dir, exam_id)
        
        # ensure directory exists
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        # save uploaded pdf file
        pdf_path = os.path.join(input_dir, "exam.pdf")
        pdf_file.save(pdf_path)
        app.logger.info(f"PDF file saved to {pdf_path}")
        
        # process pdf file
        results = pdf_to_images(input_dir, output_dir, double_pages=double_side)
        
        if "error" in results:
            return jsonify({"error": "PDF processing failed", "details": results["error"]}), 500
            
        response_data = {
            "message": "PDF processed successfully",
            "double_side": double_side
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        app.logger.error(f"PDF processing error: {e}")
        return jsonify({"error": str(e)}), 500
    

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
