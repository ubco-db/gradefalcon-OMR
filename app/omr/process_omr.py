#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
OMR Processing Module for GradeFalcon

This module integrates with OMRChecker to process scanned bubble sheets.
It provides a simplified interface for the main application to use.
"""

import os
import sys
import json
import logging
import numpy as np
import cv2
from PIL import Image
import glob

# Add OMRChecker to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'OMRChecker'))

# Import OMRChecker modules
from src.evaluator import Evaluator
from src.processors.border import BorderProcessor
from src.processors.crop import CropProcessor
from src.processors.text import TextProcessor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('omr_processor')

def load_template(template_file):
    """
    Load template file for OMR processing
    
    Args:
        template_file (str): Path to template JSON file
        
    Returns:
        dict: Template configuration
    """
    try:
        with open(template_file, 'r') as f:
            template = json.load(f)
        
        # If it's our combined template format, extract the page specific data
        if 'pages' in template:
            logger.info("Using combined template format")
            return template
        
        logger.info(f"Template loaded from {template_file}")
        return template
    except Exception as e:
        logger.error(f"Error loading template: {e}")
        raise

def load_images(image_dir):
    """
    Load all images from directory
    
    Args:
        image_dir (str): Path to directory containing images
        
    Returns:
        list: List of image paths
    """
    image_paths = []
    for ext in ['png', 'jpg', 'jpeg', 'tif', 'tiff']:
        image_paths.extend(glob.glob(os.path.join(image_dir, f'*.{ext}')))
    
    if not image_paths:
        logger.warning(f"No images found in {image_dir}")
    else:
        logger.info(f"Found {len(image_paths)} images in {image_dir}")
    
    return sorted(image_paths)

def process_image(image_path, template, answer_key=None, page_num=1):
    """
    Process a single image using template
    
    Args:
        image_path (str): Path to image
        template (dict): Template configuration
        answer_key (dict): Answer key mapping
        page_num (int): Page number (1 or 2)
        
    Returns:
        dict: Processed results
    """
    try:
        logger.info(f"Processing image: {image_path}")
        
        # Extract page specific template if using combined template
        page_template = template
        if 'pages' in template:
            page_key = f'page_{page_num}'
            if page_key in template['pages']:
                page_template = template['pages'][page_key]
            else:
                logger.error(f"Page {page_num} not found in template")
                return None
        
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            logger.error(f"Failed to load image: {image_path}")
            return None
            
        # Create evaluator
        evaluator = Evaluator()
        
        # Add processors
        evaluator.add_processor(BorderProcessor())
        evaluator.add_processor(CropProcessor())
        
        # Process image
        results = evaluator.process(image, page_template)
        
        # Grade if answer key provided
        if answer_key:
            score = 0
            total = 0
            answers = {}
            
            for qid, response in results['responses'].items():
                # Convert qid to match answer key format if needed
                if qid.startswith('q'):
                    question_num = qid[1:]
                else:
                    question_num = qid
                    
                # Store response
                answers[question_num] = response
                
                # Check answer if in answer key
                if question_num in answer_key:
                    total += 1
                    if response == answer_key[question_num]:
                        score += 1
            
            # Add grading info to results
            results['score'] = score
            results['total'] = total
            results['answers'] = answers
            results['percentage'] = round((score / total) * 100, 2) if total > 0 else 0
            
        return results
    
    except Exception as e:
        logger.error(f"Error processing image {image_path}: {e}")
        return None

def process_omr(template_file, image_dir, answer_key=None):
    """
    Process all images in a directory using template
    
    Args:
        template_file (str): Path to template JSON file
        image_dir (str): Path to directory containing images
        answer_key (dict): Answer key mapping
        
    Returns:
        dict: All processing results
    """
    # Load template
    template = load_template(template_file)
    if not template:
        return {"error": "Failed to load template"}
    
    # Load images
    image_paths = load_images(image_dir)
    if not image_paths:
        return {"error": "No images found"}
    
    # Process all images
    results = {
        "template": template_file,
        "image_dir": image_dir,
        "images": {}
    }
    
    for image_path in image_paths:
        # Determine page number from filename
        filename = os.path.basename(image_path)
        page_num = 1
        if "page_2" in filename:
            page_num = 2
        
        # Process image
        image_result = process_image(image_path, template, answer_key, page_num)
        if image_result:
            results["images"][os.path.basename(image_path)] = image_result
    
    # Summarize results
    if answer_key:
        results["summary"] = {
            "total_images": len(results["images"]),
            "average_score": sum(img["percentage"] for img in results["images"].values()) / len(results["images"]) if results["images"] else 0
        }
    
    return results

if __name__ == "__main__":
    # Command line interface
    import argparse
    
    parser = argparse.ArgumentParser(description='Process OMR bubble sheets')
    parser.add_argument('--template', required=True, help='Path to template JSON file')
    parser.add_argument('--images', required=True, help='Path to directory containing images')
    parser.add_argument('--answers', help='Path to answer key JSON file')
    parser.add_argument('--output', help='Path to output JSON file')
    
    args = parser.parse_args()
    
    # Load answer key if provided
    answer_key = None
    if args.answers:
        with open(args.answers, 'r') as f:
            answer_key = json.load(f)
    
    # Process images
    results = process_omr(args.template, args.images, answer_key)
    
    # Output results
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)
    else:
        print(json.dumps(results, indent=2)) 