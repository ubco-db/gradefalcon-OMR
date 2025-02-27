from flask import Flask, request, jsonify
import subprocess
import os
import shutil
import csv
import json
from pdf_to_images import pdf_to_images
from cassandra_client import CassandraClient

app = Flask(__name__)
cassandra_client = CassandraClient()

# To run the demo please run "docker cp src/assets/template.json app-backend-1:/code/omr/inputs/template.json". We are currently working to automate the process.

@app.route('/')
def home():
    return "Flask OMR Service is running"

@app.route('/process', methods=['POST'])
def process_omr():
    print(app.root_path)
    input_dir = "./inputs"
    out_dir = "./outputs"
    
    # Log the current directory structure for debugging
    for root, dirs, files in os.walk("/omr"):
        app.logger.info(f"Root: {root}, Dirs: {dirs}, Files: {files}")

    try:
        # Log contents of input directory before processing
        app.logger.info(f"Contents of input directory before processing: {os.listdir(input_dir)}")
        
        # Run the OMR processing script
        result = subprocess.run(
            ["python3", "main.py", "--inputDir", input_dir, "--outputDir", out_dir],
            capture_output=True,
            text=True,
            check=True
        )

        # Log the stdout and stderr for debugging
        app.logger.info(f"OMR Script Output: {result.stdout}")
        app.logger.info(f"OMR Script Errors: {result.stderr}")

        # Process results and store images in Cassandra
        process_results_and_store_images()

        return jsonify({"output": result.stdout}), 200
    
    except subprocess.CalledProcessError as e:
        app.logger.error(f"OMR Script CalledProcessError: {e}")
        app.logger.error(f"OMR Script stderr: {e.stderr}")
        return jsonify({"error": str(e), "output": e.stdout, "errors": e.stderr}), 500
    except Exception as e:
        app.logger.error(f"OMR Script Exception: {e}")
        return jsonify({"error": str(e)}), 500

def process_results_and_store_images():
    """Process OMR results, store images in Cassandra, and create a combined result with UUIDs"""
    out_dir = "./outputs"
    page1_results_path = os.path.join(out_dir, "page_1/Results/Results.csv")
    page2_results_path = os.path.join(out_dir, "page_2/Results/Results.csv")
    
    # Get page 1 results
    if not os.path.exists(page1_results_path):
        app.logger.error(f"Results file not found at {page1_results_path}")
        return
    
    # Initialize the Cassandra client if not connected
    if not cassandra_client.connected:
        cassandra_client.connect()
    
    student_results = []
    
    # Read page 1 data
    page1_data = {}
    with open(page1_results_path, 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            student_id = row['StudentID']
            
            # Store front page images in Cassandra
            front_original_path = os.path.join("./inputs/page_1", row['file_id'])
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
                }
            }
            
            # Add question fields
            for key, value in row.items():
                if key.startswith('q') and value.strip():
                    student_result[key] = value
            
            # Store student data by ID
            page1_data[student_id] = {
                "data": student_result,
                "file_id": row['file_id']
            }
    
    # Process page 2 if exists
    if os.path.exists(page2_results_path):
        with open(page2_results_path, 'r') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                student_id = row['StudentID']
                
                # Store back page images in Cassandra
                back_original_path = os.path.join("./inputs/page_2", row['file_id'])
                back_results_path = os.path.join(out_dir, "page_2/CheckedOMRs/colored", row['file_id'])
                
                back_original_uuid = cassandra_client.store_image(back_original_path)
                back_results_uuid = cassandra_client.store_image(back_results_path)
                
                # Find the matching student from page 1
                match_found = False
                
                # Try to match by student ID first
                if student_id in page1_data:
                    match_found = True
                    student_result = page1_data[student_id]["data"]
                else:
                    # Try to match by file id suffix
                    file_suffix = row['file_id'][-6:] if len(row['file_id']) >= 6 else row['file_id']
                    for sid, p1_info in page1_data.items():
                        p1_suffix = p1_info["file_id"][-6:] if len(p1_info["file_id"]) >= 6 else p1_info["file_id"]
                        if p1_suffix == file_suffix:
                            match_found = True
                            student_id = sid  # Use the student ID from page 1
                            student_result = p1_info["data"]
                            break
                
                if match_found:
                    # Update existing student entry with page 2 data
                    student_result["image_uuids"]["page2"] = {
                        "original": back_original_uuid,
                        "results": back_results_uuid
                    }
                    
                    # Add page 2 score to existing score
                    p1_score = int(student_result["Score"]) if student_result["Score"].isdigit() else 0
                    p2_score = int(row["score"]) if row["score"].isdigit() else 0
                    student_result["Score"] = str(p1_score + p2_score)
                    
                    # Add question fields from page 2
                    for key, value in row.items():
                        if key.startswith('q') and value.strip():
                            student_result[key] = value
                    
                    # Remove from page1_data to keep track of processed entries
                    if student_id in page1_data:
                        del page1_data[student_id]
                else:
                    # Create new entry if no match found
                    app.logger.warning(f"No page 1 match found for student {student_id} in page 2")
                    student_result = {
                        "StudentID": student_id,
                        "Score": row['score'],
                        "image_uuids": {
                            "page2": {
                                "original": back_original_uuid,
                                "results": back_results_uuid
                            }
                        }
                    }
                    
                    # Add question fields
                    for key, value in row.items():
                        if key.startswith('q') and value.strip():
                            student_result[key] = value
                
                student_results.append(student_result)
    
    # Add any remaining page 1 entries that didn't have a page 2 match
    for sid, p1_info in page1_data.items():
        student_results.append(p1_info["data"])
    
    # Write the combined results to a JSON file to be retrieved by the backend
    output_file = os.path.join(out_dir, "student_results.json")
    with open(output_file, 'w') as f:
        json.dump(student_results, f, indent=2)
    
    app.logger.info(f"Created combined student results with UUIDs at {output_file}")

@app.route('/student_scores', methods=['GET'])
def get_student_scores():
    """Return the combined student results with image UUIDs"""
    out_dir = "./outputs"
    student_results_path = os.path.join(out_dir, "student_results.json")
    
    if not os.path.exists(student_results_path):
        # If the file doesn't exist, call process_results_and_store_images
        process_results_and_store_images()
        
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
        input_dir = "./inputs"
        output_dir = "./inputs"
        data = request.get_json()
        double_side = data.get('doubleSide', False)

        results = pdf_to_images(input_dir, output_dir, double_pages=double_side)
        
        if "error" in results:
            return jsonify({"error": "PDF processing failed", "details": results["error"]}), 500
            
        response_data = {
            "message": "PDF processed successfully",
            "double_side": double_side
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        app.logger.error(f"PDF Processing Error: {e}")
        return jsonify({"error": str(e)}), 500
    

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
