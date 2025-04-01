import os
from pdf2image import convert_from_path
import cv2
import numpy as np
from pyzbar.pyzbar import decode
from PIL import Image

def detect_qr_codes(image):
    """
    """
    try:
        # Convert PIL image to OpenCV format
        if isinstance(image, Image.Image):
            cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        else:
            cv_image = image
            
        # decode all QR codes
        qr_codes = decode(cv_image)
        return qr_codes
    except Exception as e:
        print(f"Error detecting QR codes: {e}")
        return []

def analyze_orientation_and_page(qr_codes, width, height):
    """
    Analyze image orientation and page number based on QR code content and position
    Returns (orientation, page_number) tuple, where:
    - orientation: 1 for normal, -1 for inverted, 0 for unknown
    - page_number: 1 for first page (QR codes 1-4), 2 for second page (QR codes 5-8), 0 for unknown
    """
    if not qr_codes:
        return (0, 0)
        
    page_number = 0
    orientation = 0
    
    for qr in qr_codes:
        # extract QR code data and position
        qr_data = qr.data.decode('utf-8')
        corner = qr.polygon[0]
        x, y = corner.x, corner.y
        
        # first page QR codes (1-4)
        if qr_data in ['1', '2', '3', '4']:
            page_number = 1
            
            # determine orientation based on QR code position and content
            # QR code 1 should be in the top-left corner
            if qr_data == '1' and x < width/2 and y < height/2:
                orientation = 1
            # QR code 3 should be in the bottom-right corner
            elif qr_data == '3' and x > width/2 and y > height/2:
                orientation = 1
            # if QR code is in the wrong position, the page is inverted
            elif qr_data == '1' or qr_data == '3':
                orientation = -1
            
        # second page QR codes (5-8)
        elif qr_data in ['5', '6', '7', '8']:
            page_number = 2
            
            # determine orientation based on QR code position and content
            # QR code 5 should be in the top-left corner
            if qr_data == '5' and x < width/2 and y < height/2:
                orientation = 1
            # QR code 7 should be in the bottom-right corner
            elif qr_data == '7' and x > width/2 and y > height/2:
                orientation = 1
            # if QR code is in the wrong position, the page is inverted
            elif qr_data == '5' or qr_data == '7':
                orientation = -1
            
        # if we have determined the page number and orientation, stop
        if page_number != 0 and orientation != 0:
            break
            
    return (orientation, page_number)

def extract_corner_points(qr_codes, target_qr_values, img_width, img_height):
    """
    Extract inner corner points of specific QR codes
    target_qr_values: list of QR code values to find (e.g. ['1', '2', '3', '4'] or ['5', '6', '7', '8'])
    Returns four corner points in order [top-left, top-right, bottom-right, bottom-left]
    """
    # initialize four corner points
    corners = [None, None, None, None]  # top-left, top-right, bottom-right, bottom-left
    
    for qr in qr_codes:
        qr_data = qr.data.decode('utf-8')
        if qr_data not in target_qr_values:
            continue
            
        # get the four corner points of the QR code
        polygon = qr.polygon
        # calculate the center point of the QR code
        center_x = sum(p.x for p in polygon) / len(polygon)
        center_y = sum(p.y for p in polygon) / len(polygon)
        
        # determine which corner it is based on the QR code value
        if qr_data in ['1', '5']:  # top-left
            # find the point closest to the center of the QR code (inner point)
            inner_point = max(polygon, key=lambda p: (p.x - center_x) + (p.y - center_y))
            corners[0] = (inner_point.x, inner_point.y)
        elif qr_data in ['2', '6']:  # top-right
            inner_point = max(polygon, key=lambda p: -(p.x - center_x) + (p.y - center_y))
            corners[1] = (inner_point.x, inner_point.y)
        elif qr_data in ['3', '7']:  # bottom-right
            inner_point = max(polygon, key=lambda p: -(p.x - center_x) - (p.y - center_y))
            corners[2] = (inner_point.x, inner_point.y)
        elif qr_data in ['4', '8']:  # bottom-left
            inner_point = max(polygon, key=lambda p: (p.x - center_x) - (p.y - center_y))
            corners[3] = (inner_point.x, inner_point.y)
    
    # if any corner points are missing, use estimated values
    if None in corners:
        default_corners = [
            (img_width * 0.05, img_height * 0.05),    # top-left
            (img_width * 0.95, img_height * 0.05),    # top-right
            (img_width * 0.95, img_height * 0.95),    # bottom-right
            (img_width * 0.05, img_height * 0.95)     # bottom-left
        ]
        
        # replace missing corner points
        for i in range(4):
            if corners[i] is None:
                print(f"Warning: missing corner point {i+1}, using estimated values")
                corners[i] = default_corners[i]
    
    return corners

def correct_perspective(image, corners, target_width=2190, target_height=2970):
    """
    Correct perspective based on four corner points and resize image to standard size
    """
    # create target corner points (standard A4 size rectangle)
    target_corners = np.array([
        [0, 0],                        # top-left
        [target_width, 0],             # top-right
        [target_width, target_height], # bottom-right
        [0, target_height]             # bottom-left
    ], dtype=np.float32)
    
    # convert input corner points format
    source_corners = np.array(corners, dtype=np.float32)
    
    # convert PIL image to OpenCV format
    cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    # calculate perspective transformation matrix
    perspective_matrix = cv2.getPerspectiveTransform(source_corners, target_corners)
    
    # apply perspective transformation
    corrected_image = cv2.warpPerspective(cv_image, perspective_matrix, (target_width, target_height))
    
    # convert back to PIL format
    return Image.fromarray(cv2.cvtColor(corrected_image, cv2.COLOR_BGR2RGB))

def is_inverted(image):
    """
    Check if image is inverted and determine page number based on QR code content
    Returns (orientation, page_number) tuple, where:
    - orientation: 1 for normal, -1 for inverted, 0 for unknown
    - page_number: 1 for first page (QR codes 1-4), 2 for second page (QR codes 5-8), 0 for unknown
    """
    width, height = image.size
    try:
        # detect QR codes
        qr_codes = detect_qr_codes(image)
        
        # analyze orientation and page number
        return analyze_orientation_and_page(qr_codes, width, height)
    except Exception as e:
        print(f"Error detecting page orientation and number: {e}")
        return (0, 0)

def process_image(image):
    """
    Process single image: detect orientation, page number, correct perspective, resize
    Returns (processed image, orientation, page number)
    """
    width, height = image.size
    
    # detect QR codes
    qr_codes = detect_qr_codes(image)
    
    # analyze orientation and page number
    orientation, page_number = analyze_orientation_and_page(qr_codes, width, height)
    
    # if image is inverted, flip it first
    if orientation == -1:
        image = top_down_invert(image)
        # detect QR codes again because the image has been flipped
        qr_codes = detect_qr_codes(image)
    
    # determine the QR code values to find
    target_qr_values = ['1', '2', '3', '4'] if page_number == 1 else ['5', '6', '7', '8']
    
    # extract corner points
    corners = extract_corner_points(qr_codes, target_qr_values, width, height)
    
    # perspective correction
    corrected_image = correct_perspective(image, corners)
    
    return corrected_image, orientation, page_number

def top_down_invert(image):
    """Flip image 180 degrees"""
    return image.rotate(180)

def validate_and_split_images(images):
    """
    Validate image order, split double-page images
    Apply perspective correction and standardization to each image
    """
    if len(images) % 2 != 0:
        raise ValueError("Invalid number of pages: Each PDF must contain an even number of pages")
    
    processed_images = []
    
    for i in range(0, len(images), 2):
        # process two consecutive pages
        corrected_img1, orientation1, page_num1 = process_image(images[i])
        corrected_img2, orientation2, page_num2 = process_image(images[i + 1])
        
        # if we cannot determine the page number
        if page_num1 == 0 and page_num2 == 0:
            print(f"Warning: cannot detect page number for {i+1} and {i+2}, keep original order")
            processed_images.extend([corrected_img1, corrected_img2])
            continue
            
        # sort based on page number
        if page_num1 != 0 and page_num2 != 0:
            # if page order is incorrect, swap them
            if page_num1 > page_num2:
                corrected_img1, corrected_img2 = corrected_img2, corrected_img1
                print(f"Swapped pages {i+1} and {i+2} to correct order")
        elif page_num1 == 0:
            # if only the second page's page number is known and it's the first page, swap
            if page_num2 == 1:
                corrected_img1, corrected_img2 = corrected_img2, corrected_img1
                print(f"Swapped pages {i+1} and {i+2} to correct order")
        elif page_num2 == 0:
            # if only the first page's page number is known and it's the second page, swap
            if page_num1 == 2:
                corrected_img1, corrected_img2 = corrected_img2, corrected_img1
                print(f"Swapped pages {i+1} and {i+2} to correct order")
        
        processed_images.extend([corrected_img1, corrected_img2])
    
    return processed_images

def pdf_to_images(input_dir, output_dir, dpi=300, double_pages=False):
    """Convert PDF files to images and save in output directory"""
    results = {
        "success": True,
        "processed_files": [],
        "error": None
    }
    
    try:
        for root, _, files in os.walk(input_dir):
            for filename in files:
                if filename.endswith(".pdf"):
                    pdf_path = os.path.join(root, filename)
                    
                    try:
                        images = convert_from_path(pdf_path, dpi=dpi)
                        
                        if double_pages:
                            try:
                                page_1_dir = os.path.join(output_dir, "page_1")
                                page_2_dir = os.path.join(output_dir, "page_2")
                                os.makedirs(page_1_dir, exist_ok=True)
                                os.makedirs(page_2_dir, exist_ok=True)
                                
                                # process images: correct perspective, resize
                                processed_images = validate_and_split_images(images)
                                
                                for i, image in enumerate(processed_images):
                                    output_filename = f"{os.path.splitext(filename)[0]}_page_{i//2 + 1}.png"
                                    if i % 2 == 0:
                                        output_path = os.path.join(page_1_dir, output_filename)
                                        image.save(output_path, "PNG")
                                    else:
                                        output_path = os.path.join(page_2_dir, output_filename)
                                        image.save(output_path, "PNG")
                                        
                                results["processed_files"].append(filename)
                            except Exception as e:
                                error_msg = f"Error processing double-sided PDF {filename}: {e}"
                                print(error_msg)
                                results["error"] = error_msg
                                results["success"] = False
                        else:
                            try:
                                page_1_dir = os.path.join(output_dir, "page_1")
                                os.makedirs(page_1_dir, exist_ok=True)
                                
                                # process single-sided images
                                processed_images = []
                                for image in images:
                                    corrected_img, _, _ = process_image(image)
                                    processed_images.append(corrected_img)
                                
                                for i, image in enumerate(processed_images):
                                    output_filename = f"{os.path.splitext(filename)[0]}_page_{i + 1}.png"
                                    output_path = os.path.join(page_1_dir, output_filename)
                                    image.save(output_path, "PNG")
                                    
                                results["processed_files"].append(filename)
                            except Exception as e:
                                error_msg = f"Error processing single-sided PDF {filename}: {e}"
                                print(error_msg)
                                results["error"] = error_msg
                                results["success"] = False
                    except Exception as e:
                        error_msg = f"Error converting PDF to images {filename}: {e}"
                        print(error_msg)
                        results["error"] = error_msg
                        results["success"] = False
        
        return results
    except Exception as e:
        error_msg = f"General error in pdf_to_images: {e}"
        print(error_msg)
        results["error"] = error_msg
        results["success"] = False
        return results