import os
from pdf2image import convert_from_path
from pyzbar.pyzbar import decode
import numpy as np
import cv2

def is_inverted(image):
    """Detect if the image is inverted by checking the location of the QR code:
    Assumption: the QR code is in the top-right corner
    return 1 if the image is not inverted, 0 if no QR code is detected, -1 if the image is inverted"""
    # Convert image to grayscale
    gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    height, width = gray.shape

    # Detect QR codes
    qr_codes = decode(gray)
    # TODO: Extract QR code data

    if len(qr_codes) == 0:
        return 0
    corner = qr_codes[0].polygon[0]
    if corner.x > width / 2 and corner.y < height / 2:
        return 1
    else:
        return -1

def top_down_invert(image):
    """Invert the image if it is upside down"""
    return image.rotate(180)

def validate_and_split_images(images):
    """validate the order of images and split them into two pages for bubble sheets containing 2 pages
    Assumption: two pages from a single sheet are adjacent and in same orientation"""
    if len(images) % 2 != 0:
        raise ValueError("Invalid number of pages: Each PDF must contain an even number of pages")
        
    
    for i in range(0, len(images), 2):

        page1_has_qr = is_inverted(images[i])
        page2_has_qr = is_inverted(images[i + 1])

        # orientation correction
        if page1_has_qr == -1 or page2_has_qr == -1:
            images[i] = top_down_invert(images[i])
            images[i + 1] = top_down_invert(images[i + 1])

        if page1_has_qr != 0 and page2_has_qr == 0:
            # correct order
            continue
        elif page1_has_qr == 0 and page2_has_qr != 0:
            # switch
            images[i], images[i + 1] = images[i + 1], images[i]
        else:
            raise ValueError(f"Scan error in {i//2 + 1}.")            
    return images

def pdf_to_images(input_dir, output_dir, dpi=300, double_pages=False):
    """convert PDF files to images and save them in the output directory"""

    for root, _, files in os.walk(input_dir):
        # relative_path = os.path.relpath(root, input_dir)
        # output_subdir = os.path.join(output_dir, relative_path)
        # os.makedirs(output_subdir, exist_ok=True)
        for filename in files:
            if filename.endswith(".pdf"):
                pdf_path = os.path.join(root, filename)
                images = convert_from_path(pdf_path, dpi=dpi)
                if double_pages:
                    try:
                        page_1_dir = os.path.join(output_dir, "page_1")
                        page_2_dir = os.path.join(output_dir, "page_2")
                        os.makedirs(page_1_dir, exist_ok=True)
                        os.makedirs(page_2_dir, exist_ok=True)
                        images = validate_and_split_images(images)
                        for i, image in enumerate(images):
                            if i%2 == 0:
                                image.save(os.path.join(page_1_dir, f"{os.path.splitext(filename)[0]}_page_{i//2 + 1}.png"), "PNG")
                            else:
                                image.save(os.path.join(page_2_dir, f"{os.path.splitext(filename)[0]}_page_{i//2 + 1}.png"), "PNG")
                    except Exception as e:
                        return {"filename": filename, "error": str(e)}
                else:
                    page_1_dir = os.path.join(output_dir, "page_1")
                    os.makedirs(page_1_dir, exist_ok=True)
                    for i, image in enumerate(images):
                        if is_inverted(image) == -1:
                            image = top_down_invert(image)
                        image.save(os.path.join(page_1_dir, f"{os.path.splitext(filename)[0]}_page_{i + 1}.png"), "PNG")

        
    return {"filename": filename}