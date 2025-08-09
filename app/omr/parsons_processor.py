"""
Parsons Problem Processing Module

This module handles the processing and scoring of Parsons problems (code ordering questions)
using edit distance algorithms for partial credit grading.
"""

import logging

logger = logging.getLogger(__name__)

def process_parsons_answers(result_row):
    """
    Process Parsons problem answers from OMR results.
    Expected format: pos1, pos2, pos3, etc. with multiple digits (e.g., "15" for bubbles 1 and 5)
    Returns ordered sequence based on filled positions
    
    Args:
        result_row (dict): OMR result row containing position data
        
    Returns:
        list: Ordered sequence of item numbers, or None if no valid data
    """
    parsons_positions = {}
    
    # Look for position fields (pos1, pos2, pos3, etc.)
    for key, value in result_row.items():
        if key.startswith('pos') and value.strip():
            try:
                position_num = int(key[3:])  # Extract position number (pos1 -> 1)
                digits_string = value.strip()
                
                # Handle multiple digits in the same field (e.g., "15" means bubbles 1 and 5 were filled)
                if digits_string:
                    # Convert string of digits to integer
                    # For "15", this becomes integer 15
                    # For "3", this becomes integer 3
                    item_number = int(digits_string)
                    parsons_positions[position_num] = item_number
                    
            except (ValueError, IndexError):
                logger.warning(f"Invalid Parsons position format: {key}={value}")
                continue
    
    if not parsons_positions:
        return None
        
    # Convert positions to ordered sequence
    # Sort by position number and extract the item numbers
    ordered_sequence = []
    for pos in sorted(parsons_positions.keys()):
        ordered_sequence.append(parsons_positions[pos])
        
    logger.info(f"Processed Parsons sequence: {ordered_sequence}")
    return ordered_sequence

def calculate_edit_distance(sequence1, sequence2):
    """
    Calculate edit distance (Levenshtein distance) between two sequences.
    Used for scoring Parsons problems.
    
    Args:
        sequence1 (list): First sequence
        sequence2 (list): Second sequence
        
    Returns:
        int: Edit distance between the sequences
    """
    if not sequence1 and not sequence2:
        return 0
    if not sequence1:
        return len(sequence2)
    if not sequence2:
        return len(sequence1)
    
    # Create distance matrix
    m, n = len(sequence1), len(sequence2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    # Initialize base cases
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    
    # Fill the matrix using dynamic programming
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if sequence1[i-1] == sequence2[j-1]:
                dp[i][j] = dp[i-1][j-1]  # No change needed
            else:
                dp[i][j] = 1 + min(
                    dp[i-1][j],    # Deletion
                    dp[i][j-1],    # Insertion
                    dp[i-1][j-1]   # Substitution
                )
    
    return dp[m][n]

def score_parsons_problem(student_sequence, correct_sequence, max_score=10):
    """
    Score a Parsons problem using edit distance.
    Returns partial credit based on how close the student's answer is to correct.
    
    Args:
        student_sequence (list): Student's ordered sequence
        correct_sequence (list): Correct ordered sequence
        max_score (int): Maximum possible score
        
    Returns:
        float: Score between 0 and max_score
    """
    if not student_sequence or not correct_sequence:
        return 0
    
    edit_dist = calculate_edit_distance(student_sequence, correct_sequence)
    max_possible_distance = max(len(student_sequence), len(correct_sequence))
    
    # Perfect match gets full score
    if edit_dist == 0:
        return max_score
    
    # Calculate partial credit (inverse relationship with edit distance)
    # Minimum score is 0, maximum is max_score
    score = max(0, max_score * (1 - edit_dist / max_possible_distance))
    
    logger.info(f"Parsons scoring - Student: {student_sequence}, Correct: {correct_sequence}, "
               f"Edit distance: {edit_dist}, Score: {score:.2f}/{max_score}")
    
    return round(score, 2)

def calculate_longest_common_subsequence(seq1, seq2):
    """
    Calculate the longest common subsequence between two sequences.
    Alternative scoring method for Parsons problems.
    
    Args:
        seq1 (list): First sequence
        seq2 (list): Second sequence
        
    Returns:
        int: Length of longest common subsequence
    """
    if not seq1 or not seq2:
        return 0
    
    m, n = len(seq1), len(seq2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if seq1[i-1] == seq2[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])
    
    return dp[m][n]

def score_parsons_problem_lcs(student_sequence, correct_sequence, max_score=10):
    """
    Alternative scoring method using Longest Common Subsequence.
    Rewards students for getting parts of the sequence in correct order.
    
    Args:
        student_sequence (list): Student's ordered sequence
        correct_sequence (list): Correct ordered sequence
        max_score (int): Maximum possible score
        
    Returns:
        float: Score between 0 and max_score
    """
    if not student_sequence or not correct_sequence:
        return 0
    
    lcs_length = calculate_longest_common_subsequence(student_sequence, correct_sequence)
    max_possible_lcs = min(len(student_sequence), len(correct_sequence))
    
    # Perfect subsequence match gets full score
    if lcs_length == len(correct_sequence):
        return max_score
    
    # Partial credit based on LCS ratio
    score = max(0, max_score * (lcs_length / len(correct_sequence)))
    
    logger.info(f"Parsons LCS scoring - Student: {student_sequence}, Correct: {correct_sequence}, "
               f"LCS length: {lcs_length}, Score: {score:.2f}/{max_score}")
    
    return round(score, 2)